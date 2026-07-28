const theia = require('@theia/core/lib/browser');
console.log('OpenHandler in @theia/core/lib/browser:', !!theia.OpenHandler);
const navigatable = require('@theia/core/lib/browser/navigatable');
console.log('OpenHandler in navigatable:', !!navigatable.OpenHandler);
