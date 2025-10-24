import { spawn } from 'child_process';
import { access, constants, readFile, readdir } from 'fs/promises';
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import type { KubeConfigSummary, KubectlResult, KubeConfigFile } from '../common/kubeTypes';
import { type KubeContext } from '../common/kubeTypes';

const DEFAULT_RELATIVE_CONFIG = path.join('.kube', 'config');

let currentKubeconfigPath: string | null = null;

function resolveKubeconfigPath(): string {
  // If a specific config was set, use it
  if (currentKubeconfigPath) {
    return currentKubeconfigPath;
  }

  const envPath = process.env.KUBECONFIG;
  if (envPath && envPath.trim().length > 0) {
    const [firstPath] = envPath.split(path.delimiter).filter(Boolean);
    if (firstPath) {
      return firstPath;
    }
  }

  return path.join(os.homedir(), DEFAULT_RELATIVE_CONFIG);
}

export async function discoverKubeconfigs(): Promise<KubeConfigFile[]> {
  const configs: KubeConfigFile[] = [];
  const homeDir = os.homedir();
  const kubeDir = path.join(homeDir, '.kube');
  const defaultPath = path.join(kubeDir, 'config');

  try {
    // Check default config
    await access(defaultPath, constants.R_OK);
    configs.push({
      path: defaultPath,
      name: 'default',
      isDefault: true,
    });
  } catch {
    // Default config doesn't exist
  }

  try {
    // Scan .kube directory for other config files
    const files = await readdir(kubeDir);
    
    for (const file of files) {
      // Skip the default config (already added)
      if (file === 'config') continue;
      
      // Look for files that might be kubeconfigs
      // Common patterns: config-*, kubeconfig-*, *.yaml, *.yml, or files without extension
      if (
        file.startsWith('config-') ||
        file.startsWith('kubeconfig') ||
        file.endsWith('.yaml') ||
        file.endsWith('.yml') ||
        !file.includes('.')
      ) {
        const filePath = path.join(kubeDir, file);
        
        try {
          await access(filePath, constants.R_OK);
          
          // Try to parse it as YAML to verify it's a valid kubeconfig
          const content = await readFile(filePath, 'utf8');
          const parsed = YAML.parse(content);
          
          // Check if it looks like a kubeconfig (has contexts or clusters)
          if (parsed && (parsed.contexts || parsed.clusters)) {
            configs.push({
              path: filePath,
              name: file,
              isDefault: false,
            });
          }
        } catch {
          // Skip files that can't be read or parsed
        }
      }
    }
  } catch {
    // .kube directory doesn't exist or can't be read
  }

  // Check KUBECONFIG environment variable for additional paths
  const envPath = process.env.KUBECONFIG;
  if (envPath && envPath.trim().length > 0) {
    const paths = envPath.split(path.delimiter).filter(Boolean);
    
    for (const configPath of paths) {
      // Skip if already in the list
      if (configs.some(c => c.path === configPath)) continue;
      
      try {
        await access(configPath, constants.R_OK);
        configs.push({
          path: configPath,
          name: path.basename(configPath),
          isDefault: false,
        });
      } catch {
        // Skip inaccessible paths
      }
    }
  }

  return configs;
}

export function setKubeconfigPath(configPath: string): void {
  currentKubeconfigPath = configPath;
}

export async function loadKubeConfig(): Promise<KubeConfigSummary> {
  const kubeconfigPath = resolveKubeconfigPath();

  await access(kubeconfigPath, constants.R_OK);

  const fileContents = await readFile(kubeconfigPath, 'utf8');
  const config = YAML.parse(fileContents) ?? {};

  const rawContexts: Array<{ name: string; context?: Record<string, any> }> =
    Array.isArray(config.contexts) ? config.contexts : [];
  const rawClusters: Array<{ name: string; cluster?: Record<string, any> }> =
    Array.isArray(config.clusters) ? config.clusters : [];

  const clusterMap = new Map<string, Record<string, any>>();
  rawClusters.forEach((cluster) => {
    if (cluster?.name) {
      clusterMap.set(cluster.name, cluster.cluster ?? {});
    }
  });

  const contexts: KubeContext[] = rawContexts.map((ctx) => {
    const contextData = ctx.context ?? {};
    const clusterName: string | undefined = contextData.cluster;
    const cluster = clusterName ? clusterMap.get(clusterName) ?? {} : {};

    return {
      name: ctx.name,
      cluster: clusterName,
      user: contextData.user,
      namespace: contextData.namespace,
      server: cluster?.server,
    };
  });

  const currentContext =
    typeof config['current-context'] === 'string' ? config['current-context'] : null;

  // Discover available kubeconfig files
  const availableConfigs = await discoverKubeconfigs();

  return {
    contexts,
    currentContext,
    kubeconfigPath,
    availableConfigs,
  };
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === '\\') {
        const next = command[i + 1];
        if (next) {
          current += next;
          i += 1;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuotes = true;
      quoteChar = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export async function runKubectlCommand(
  contextName: string,
  commandInput: string
): Promise<KubectlResult> {
  if (!commandInput.trim()) {
    throw new Error('Command cannot be empty');
  }

  const tokens = tokenize(commandInput.trim());
  const args =
    tokens[0] && tokens[0].toLowerCase() === 'kubectl' ? tokens.slice(1) : tokens;

  if (args.length === 0) {
    throw new Error('Provide kubectl arguments, for example: get pods');
  }

  const finalArgs = ['--context', contextName, ...args];
  const kubeconfigPath = resolveKubeconfigPath();

  return executeKubectl(finalArgs, kubeconfigPath);
}

async function executeKubectl(args: string[], kubeconfigPath?: string): Promise<KubectlResult> {
  return new Promise<KubectlResult>((resolve, reject) => {
    const env = { ...process.env };
    if (kubeconfigPath) {
      env.KUBECONFIG = kubeconfigPath;
    }

    const child = spawn('kubectl', args, {
      env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('error', (error: NodeJS.ErrnoException) => {
      if (error?.code === 'ENOENT') {
        reject(
          new Error(
            'kubectl executable not found. Install kubectl or add it to your PATH.'
          )
        );
        return;
      }
      reject(error);
    });

    child.once('close', (code) => {
      resolve({
        stdout,
        stderr,
        code,
      });
    });
  });
}

export async function useContext(contextName: string): Promise<void> {
  if (!contextName) {
    throw new Error('Context name is required');
  }

  const kubeconfigPath = resolveKubeconfigPath();
  const result = await executeKubectl(['config', 'use-context', contextName], kubeconfigPath);

  if (result.code !== 0) {
    const message = result.stderr || result.stdout || 'Failed to switch context';
    throw new Error(message.trim());
  }
}
