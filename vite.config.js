c export default {
  root: "./client/",
  publicDir: "./client/static/",
  build: {
    outDir: "./client_dist/",
    emptyOutDir: true,
    reportCompressedSize: true,
  },
  server: {
    port: 5173,
    host: true,
    open: false,
  },
  worker: {
    format: "es",
  },
};
