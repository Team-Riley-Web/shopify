#!/usr/bin/env node
import { init } from '../lib/init.mjs';

console.log('@team-riley/shopify: adding the storefront to ' + process.cwd());
init();
