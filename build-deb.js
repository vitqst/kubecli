#!/usr/bin/env node

const installer = require('electron-installer-debian');

const options = {
  src: 'out/kubecli-linux-x64/',
  dest: 'out/make/deb/x64/',
  arch: 'amd64',
  options: {
    name: 'kubecli',
    productName: 'KubeCLI',
    genericName: 'Kubernetes CLI Manager',
    description: 'Terminal-based Kubernetes resource management tool',
    version: '1.0.0',
    section: 'devel',
    priority: 'optional',
    maintainer: 'vit <vit@gmail.com>',
    homepage: 'https://github.com/vit/kubecli',
    bin: 'kubecli',
    categories: ['Development', 'Utility'],
    // Don't pack node-pty into asar - it needs to be unpacked for native modules
    asarUnpack: '**/node_modules/node-pty/**/*'
  }
};

console.log('Creating .deb package...');

installer(options)
  .then(() => console.log('✓ Successfully created .deb package!'))
  .catch(err => {
    console.error('✗ Error creating .deb package:', err);
    process.exit(1);
  });
