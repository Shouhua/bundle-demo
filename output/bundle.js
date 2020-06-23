const modules = {
  "/Users/pengshouhua/demo/vue/bundle-demo/fixture/index.js": function(exports, require) {
    const _imported = require("/Users/pengshouhua/demo/vue/bundle-demo/fixture/square.js");
    const _imported2 = require("/Users/pengshouhua/demo/vue/bundle-demo/fixture/cicle.js");
    console.log('Area of square: ', _imported["default"](5));
    console.log('Area of cicle: ', _imported2["default"](5));
    },
  "/Users/pengshouhua/demo/vue/bundle-demo/fixture/square.js": function(exports, require) {
      function area(side) {
      return side * side;
    }
    exports.default = area;
    },
  "/Users/pengshouhua/demo/vue/bundle-demo/fixture/cicle.js": function(exports, require) {
      const PI = 3.141;
    function area(radius) {
      return PI * radius * radius;
    }
    exports.default = area;
    },
}
;
const entry = "/Users/pengshouhua/demo/vue/bundle-demo/fixture/index.js";
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
  