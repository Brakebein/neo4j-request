import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';

export default {
  external: ['neo4j-driver'],
  input: 'src/index.ts',
  plugins: [
    nodeResolve(),
    typescript()
  ],
  output: [
    {
      file: 'dist/build.js',
      format: 'cjs'
    },
    {
      file: 'dist/build.module.js',
      format: 'es'
    }
  ]
};
