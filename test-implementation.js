#!/usr/bin/env node

/**
 * Integration test script for Use Case 001
 * Tests the core Kubernetes functionality without launching the full Electron UI
 */

const { spawn } = require('child_process');
const { readFile, access, constants } = require('fs/promises');
const os = require('os');
const path = require('path');
const YAML = require('yaml');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  console.log(`\n${colors.blue}▶ ${name}${colors.reset}`);
}

function logPass(message) {
  console.log(`  ${colors.green}✓${colors.reset} ${message}`);
}

function logFail(message) {
  console.log(`  ${colors.red}✗${colors.reset} ${message}`);
}

function logInfo(message) {
  console.log(`  ${colors.cyan}ℹ${colors.reset} ${message}`);
}

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    logPass(message);
    return true;
  } else {
    failedTests++;
    logFail(message);
    return false;
  }
}

// Resolve kubeconfig path (same logic as kube.ts)
function resolveKubeconfigPath() {
  const envPath = process.env.KUBECONFIG;
  if (envPath && envPath.trim().length > 0) {
    const [firstPath] = envPath.split(path.delimiter).filter(Boolean);
    if (firstPath) {
      return firstPath;
    }
  }
  return path.join(os.homedir(), '.kube', 'config');
}

// Test 1: Verify kubeconfig exists and is readable
async function testKubeconfigAccess() {
  logTest('Test 1: Kubeconfig Access');
  
  try {
    const kubeconfigPath = resolveKubeconfigPath();
    logInfo(`Kubeconfig path: ${kubeconfigPath}`);
    
    await access(kubeconfigPath, constants.R_OK);
    assert(true, 'Kubeconfig file exists and is readable');
    return kubeconfigPath;
  } catch (error) {
    assert(false, `Kubeconfig access failed: ${error.message}`);
    return null;
  }
}

// Test 2: Parse kubeconfig and extract contexts
async function testLoadContexts(kubeconfigPath) {
  logTest('Test 2: Load and Parse Contexts');
  
  if (!kubeconfigPath) {
    assert(false, 'Skipped: No kubeconfig path available');
    return null;
  }
  
  try {
    const fileContents = await readFile(kubeconfigPath, 'utf8');
    assert(true, 'Kubeconfig file read successfully');
    
    const config = YAML.parse(fileContents);
    assert(config !== null && typeof config === 'object', 'Kubeconfig parsed as YAML');
    
    const contexts = Array.isArray(config.contexts) ? config.contexts : [];
    assert(contexts.length > 0, `Found ${contexts.length} context(s)`);
    
    const clusters = Array.isArray(config.clusters) ? config.clusters : [];
    assert(clusters.length > 0, `Found ${clusters.length} cluster(s)`);
    
    const currentContext = config['current-context'];
    assert(typeof currentContext === 'string', `Current context: ${currentContext}`);
    
    // Verify context structure
    if (contexts.length > 0) {
      const firstContext = contexts[0];
      assert(firstContext.name, `Context has name: ${firstContext.name}`);
      assert(firstContext.context, 'Context has context object');
    }
    
    return { config, contexts, clusters, currentContext };
  } catch (error) {
    assert(false, `Failed to load contexts: ${error.message}`);
    return null;
  }
}

// Test 3: Verify kubectl is available
async function testKubectlAvailable() {
  logTest('Test 3: kubectl Availability');
  
  return new Promise((resolve) => {
    const child = spawn('kubectl', ['version', '--client'], {
      env: process.env,
    });
    
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        assert(false, 'kubectl not found in PATH');
      } else {
        assert(false, `kubectl spawn error: ${error.message}`);
      }
      resolve(false);
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        assert(true, `kubectl is available: ${output.trim()}`);
        resolve(true);
      } else {
        assert(false, `kubectl exited with code ${code}`);
        resolve(false);
      }
    });
  });
}

// Test 4: Test kubectl command execution with context
async function testKubectlCommand(contextName) {
  logTest('Test 4: kubectl Command Execution');
  
  if (!contextName) {
    assert(false, 'Skipped: No context name available');
    return false;
  }
  
  logInfo(`Testing with context: ${contextName}`);
  
  return new Promise((resolve) => {
    const args = ['--context', contextName, 'version', '--client'];
    const child = spawn('kubectl', args, {
      env: process.env,
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    
    child.on('error', (error) => {
      assert(false, `Command execution error: ${error.message}`);
      resolve(false);
    });
    
    child.on('close', (code) => {
      assert(code === 0, `Command executed with exit code ${code}`);
      assert(stdout.length > 0, 'Command produced output');
      assert(typeof code === 'number', 'Exit code is a number');
      
      if (code === 0) {
        logInfo(`Output: ${stdout.trim()}`);
      }
      
      resolve(code === 0);
    });
  });
}

// Test 5: Test context switching
async function testContextSwitch(contextName) {
  logTest('Test 5: Context Switching');
  
  if (!contextName) {
    assert(false, 'Skipped: No context name available');
    return false;
  }
  
  logInfo(`Switching to context: ${contextName}`);
  
  return new Promise((resolve) => {
    const args = ['config', 'use-context', contextName];
    const child = spawn('kubectl', args, {
      env: process.env,
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    
    child.on('close', (code) => {
      assert(code === 0, `Context switch completed with exit code ${code}`);
      
      if (code === 0) {
        logInfo(`Result: ${stdout.trim()}`);
      } else if (stderr) {
        logInfo(`Error: ${stderr.trim()}`);
      }
      
      resolve(code === 0);
    });
  });
}

// Test 6: Test command tokenization (simulate the tokenize function)
function testCommandTokenization() {
  logTest('Test 6: Command Tokenization');
  
  const testCases = [
    { input: 'get pods', expected: ['get', 'pods'] },
    { input: 'kubectl get pods', expected: ['kubectl', 'get', 'pods'] },
    { input: 'get pods -A', expected: ['get', 'pods', '-A'] },
    { input: 'get pods -n default', expected: ['get', 'pods', '-n', 'default'] },
    { input: '  get  pods  ', expected: ['get', 'pods'] },
  ];
  
  testCases.forEach(({ input, expected }) => {
    const tokens = input.trim().split(/\s+/);
    const match = JSON.stringify(tokens) === JSON.stringify(expected);
    assert(match, `"${input}" → [${tokens.join(', ')}]`);
  });
}

// Test 7: Verify build output
async function testBuildOutput() {
  logTest('Test 7: Build Output Verification');
  
  const outDir = path.join(__dirname, 'out');
  
  try {
    await access(outDir, constants.R_OK);
    assert(true, 'Build output directory exists');
    
    // Check for packaged application
    const packagedDir = path.join(outDir, 'kubecli-linux-x64');
    await access(packagedDir, constants.R_OK);
    assert(true, 'Packaged application directory exists');
    
    return true;
  } catch (error) {
    assert(false, `Build output verification failed: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  log('\n═══════════════════════════════════════════════════════', 'cyan');
  log('  Kubernetes CLI Manager - Use Case 001 Tests', 'cyan');
  log('═══════════════════════════════════════════════════════\n', 'cyan');
  
  // Run tests in sequence
  const kubeconfigPath = await testKubeconfigAccess();
  const contextData = await testLoadContexts(kubeconfigPath);
  const kubectlAvailable = await testKubectlAvailable();
  
  if (kubectlAvailable && contextData && contextData.currentContext) {
    await testContextSwitch(contextData.currentContext);
    await testKubectlCommand(contextData.currentContext);
  }
  
  testCommandTokenization();
  await testBuildOutput();
  
  // Print summary
  log('\n═══════════════════════════════════════════════════════', 'cyan');
  log('  Test Summary', 'cyan');
  log('═══════════════════════════════════════════════════════', 'cyan');
  log(`Total tests:  ${totalTests}`, 'blue');
  log(`Passed:       ${passedTests}`, 'green');
  log(`Failed:       ${failedTests}`, failedTests > 0 ? 'red' : 'green');
  log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`, 
      failedTests === 0 ? 'green' : 'yellow');
  log('═══════════════════════════════════════════════════════\n', 'cyan');
  
  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  log(`\nFatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
