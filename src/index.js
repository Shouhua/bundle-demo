import fs from 'fs-extra';
import path from 'path';
// import * as babel from '@babel/core';
import { parseSync, types, transformFromAstSync } from '@babel/core';

function build({entryFile, outputFolder}) {
  const graph = createDependencyGraph(entryFile);

  fs.outputFileSync(path.join(outputFolder, 'graph.json'), JSON.stringify(graph, null, 2))

  const outputFiles = bundle(graph);

  for(const outputFile of outputFiles){
    fs.outputFileSync(
      path.join(outputFolder, outputFile.name),
      outputFile.content,
      'utf-8'
    );
  }
}

function createDependencyGraph(entryFile) {
  const rootModule = createModule(entryFile);
  return rootModule;
}

function createModule(filePath) {
  return new Module(filePath);
}

let moduelDependenciesCache = new Map();

class Module {
  constructor(filePath) {
    this.filePath = filePath;
    this.content = fs.readFileSync(filePath, 'utf-8');
    try {
      this.ast = parseSync(this.content);
    } catch (error) {
      console.log(error.message);  
    }
    this.dependencies = this.findDependencies();
  }

  findDependencies() {
    return this.ast.program.body
      .filter(node => node.type === 'ImportDeclaration')
      .map(node => node.source.value)
      .map(relativePath => resolveRequest(this.filePath, relativePath))
      .map(absolutePath => createModule(absolutePath));
  }

  transformModuleInterface() {
    const t = types;
    const { filePath } = this;
    const { ast, code } = transformFromAstSync(this.ast, this.content, {
      ast: true,
      plugins: [
        function() {
          return {
            visitor: {
              ImportDeclaration(path) {
                const newIdentifier = path.scope.generateUidIdentifier(
                  'imported'
                );

                for (const specifier of path.get('specifiers')) {
                  const binding = specifier.scope.getBinding(
                    specifier.node.local.name
                  );
                  const importedKey = specifier.isImportDefaultSpecifier()
                    ? 'default'
                    : specifier.get('imported.name').node;

                  for (const referencePath of binding.referencePaths) {
                    referencePath.replaceWith(
                      t.memberExpression(
                        newIdentifier,
                        t.stringLiteral(importedKey),
                        true
                      )
                    );
                  }
                }

                path.replaceWith(
                  t.variableDeclaration('const', [
                    t.variableDeclarator(
                      newIdentifier,
                      t.callExpression(t.identifier('require'), [
                        t.stringLiteral(
                          resolveRequest(
                            filePath,
                            path.get('source.value').node
                          )
                        ),
                      ])
                    ),
                  ])
                );
              },
              ExportDefaultDeclaration(path) {
                path.replaceWith(
                  t.expressionStatement(
                    t.assignmentExpression(
                      '=',
                      t.memberExpression(
                        t.identifier('exports'),
                        t.identifier('default'),
                        false
                      ),
                      t.toExpression(path.get('declaration').node)
                    )
                  )
                );
              },
              ExportNamedDeclaration(path) {
                const declarations = [];
                if (path.has('declaration')) {
                  if (path.get('declaration').isFunctionDeclaration()) {
                    declarations.push({
                      name: path.get('declaration.id').node,
                      value: t.toExpression(path.get('declaration').node),
                    });
                  } else {
                    path
                      .get('declaration.declarations')
                      .forEach(declaration => {
                        declarations.push({
                          name: declaration.get('id').node,
                          value: declaration.get('init').node,
                        });
                      });
                  }
                } else {
                  path.get('specifiers').forEach(specifier => {
                    declarations.push({
                      name: specifier.get('exported').node,
                      value: specifier.get('local').node,
                    });
                  });
                }
                path.replaceWithMultiple(
                  declarations.map(decl =>
                    t.expressionStatement(
                      t.assignmentExpression(
                        '=',
                        t.memberExpression(
                          t.identifier('exports'),
                          decl.name,
                          false
                        ),
                        decl.value
                      )
                    )
                  )
                );
              },
            }
          }
        }
      ]
    });
    this.ast = ast;
    this.content = code;
  }
}

function resolveRequest(requester, requestedPath) {
  return path.join(path.dirname(requester), requestedPath);
}

function bundle(graph) {
  const modules = collectModules(graph);
  const moduleMap = toModuleMap(modules);
  const moduleCode = addRuntime(moduleMap, modules[0].filePath);
  return [{name: 'bundle.js', content: moduleCode}];
}

function collectModules(graph) {
  const modules = [];
  collect(graph, modules);
  return modules;
}

function collect(module, modules) {
  modules.push(module);
  module.dependencies.forEach(dependency => collect(dependency, modules));
}

function toModuleMap(modules) {
  let moduleMap = '';
  moduleMap += '{';
  for(const module of modules) {
    module.transformModuleInterface();
    moduleMap += `"${module.filePath}": `;
    moduleMap += `function(exports, require) {
      ${module.content}
    },\n`;
  }
  moduleMap += '}\n';
  return moduleMap;
}

function addRuntime(moduleMap, entryPoint) {  
  return trim(`
    const modules = ${moduleMap};
    const entry = "${entryPoint}";
    function webpackStart({ modules, entry }) {
      const moduleCache = {};
      const require = moduleName => {
        // if in cache, return the cached version
        if (moduleCache[moduleName]) {
          return moduleCache[moduleName];
        }
        const exports = {};        
        // this will prevent infinite "require" loop        
        // from circular dependencies        
        moduleCache[moduleName] = exports;            
        // "require"-ing the module,        
        // exported stuff will assigned to "exports"        
        modules[moduleName](exports, require);        
        return moduleCache[moduleName];      
      };          
      // start the program      
      require(entry);    
    }    
    webpackStart({ modules, entry });
  `);
}

// trim away spaces before the line
function trim(str) {  
  const lines = str.split('\n').filter(Boolean);  
  const padLength = lines[0].length - lines[0].trimLeft().length;  
  const regex = new RegExp(`^\\s{${padLength}}`);  
  return lines.map(line => line.replace(regex, '')).join('\n');
}

build({
  entryFile: path.join(__dirname, '../fixture/index.js'),
  outputFolder: path.join(__dirname, '../output')
});
