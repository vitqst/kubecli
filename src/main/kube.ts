import { spawn } from 'child_process';
import { access, constants, readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import type { KubeConfigSummary, KubectlResult } from '../common/kubeTypes';
import { type KubeContext } from '../common/kubeTypes';

const DEFAULT_RELATIVE_CONFIG = path.join('.kube', 'config');

function resolveKubeconfigPath(): string {
  const envPath = process.env.KUBECONFIG;
  if (envPath && envPath.trim().length > 0) {
    const [firstPath] = envPath.split(path.delimiter).filter(Boolean);
    if (firstPath) {
      return firstPath;
    }
  }

  return path.join(os.homedir(), DEFAULT_RELATIVE_CONFIG);
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

  return {
    contexts,
    currentContext,
    kubeconfigPath,
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

  return executeKubectl(finalArgs);
}

async function executeKubectl(args: string[]): Promise<KubectlResult> {
  return new Promise<KubectlResult>((resolve, reject) => {
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

    child.once('error', (error) => {
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

  const result = await executeKubectl(['config', 'use-context', contextName]);

  if (result.code !== 0) {
    const message = result.stderr || result.stdout || 'Failed to switch context';
    throw new Error(message.trim());
  }
}
