/**
 * esbuild 插件：将 public 目录下的文件内联为文本字符串
 * 
 * 这样在 SEA 模式下，所有静态资源都从内存读取
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'inline-public',
  setup(build) {
    // 拦截对 ../public/ 的 require
    build.onResolve({ filter: /^\.\.\/public\// }, args => {
      return {
        path: path.resolve(args.resolveDir, args.path),
        namespace: 'inline-public',
      };
    });

    // 将匹配的文件作为文本读取
    build.onLoad({ filter: /.*/, namespace: 'inline-public' }, args => {
      const content = fs.readFileSync(args.path, 'utf-8');
      return {
        contents: `module.exports = ${JSON.stringify(content)};`,
        loader: 'js',
      };
    });
  },
};
