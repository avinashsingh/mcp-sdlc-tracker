import * as fs from 'fs';
import * as path from 'path';
import { get_knowledge_graph } from '../tools/kg.ts';

// Simple test framework
const tests: { name: string; fn: () => void }[] = [];
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runTests() {
  console.log('Running Knowledge Graph Tests...\n');

  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`✅ ${name}: PASSED`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}: FAILED - ${error.message}`);
      failed++;
    }
  }

  console.log(`\nTest Summary: ${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    console.log('❌ Some tests failed');
    process.exit(1);
  } else {
    console.log('✅ All tests passed');
  }
}

// Test setup
const testRootPath = process.cwd();

// Tests

test('get_knowledge_graph should generate and return knowledge graph', () => {
  const kg = get_knowledge_graph(testRootPath);

  // Check basic structure
  assert(kg.hasOwnProperty('t'), 'Should have tree property');
  assert(kg.hasOwnProperty('f'), 'Should have files property');
  assert(typeof kg.t === 'string', 'Tree should be string');
  assert(Array.isArray(kg.f), 'Files should be array');
});

test('get_knowledge_graph should include project files', () => {
  const kg = get_knowledge_graph(testRootPath);

  // Should have some files
  assert(kg.f.length > 0, 'Should have some files');

  // Check that files have expected properties
  const firstFile = kg.f[0];
  assert(firstFile.hasOwnProperty('f'), 'File should have path');
  assert(typeof firstFile.f === 'string', 'File path should be string');
});

test('knowledge graph should have valid file entries', () => {
  const kg = get_knowledge_graph(testRootPath);

  kg.f.forEach((file: any) => {
    assert(file.hasOwnProperty('f'), 'File should have path');
    assert(typeof file.f === 'string', 'Path should be string');

    if (file.i) assert(Array.isArray(file.i), 'Imports should be array');
    if (file.c) assert(Array.isArray(file.c), 'Classes should be array');
    if (file.fn) assert(Array.isArray(file.fn), 'Functions should be array');
    if (file.ca) assert(Array.isArray(file.ca), 'Calls should be array');
  });
});

test('should include TypeScript files', () => {
  const kg = get_knowledge_graph(testRootPath);

  const tsFiles = kg.f.filter((file: any) => file.f.endsWith('.ts'));
  assert(tsFiles.length > 0, 'Should have TypeScript files');
});

test('should include JavaScript files', () => {
  const kg = get_knowledge_graph(testRootPath);

  const jsFiles = kg.f.filter((file: any) => file.f.endsWith('.js'));
  assert(jsFiles.length > 0, 'Should have JavaScript files');
});

test('should have tree structure', () => {
  const kg = get_knowledge_graph(testRootPath);

  assert(kg.t.includes('├──'), 'Should have tree structure');
});

test('should exclude .kg.json from analysis', () => {
  const kg = get_knowledge_graph(testRootPath);

  const kgFiles = kg.f.filter((file: any) => file.f.includes('.kg.json'));
  assert(kgFiles.length === 0, 'Should not include .kg.json files');
});

// Run tests
runTests();