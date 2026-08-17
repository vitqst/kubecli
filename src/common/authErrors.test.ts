import { describe, expect, it } from 'vitest';
import { isAzureAuthError } from './authErrors';

describe('isAzureAuthError', () => {
  it.each([
    "AADSTS50058: A silent sign-in request was sent but no user is signed in",
    "Please run 'az login' to setup account",
    'AzureCLICredential authentication failed: token expired',
    'kubelogin: failed to get token: interaction_required',
    'exec: executable kubelogin failed because the Azure token has expired',
    'the server has asked for the client to provide credentials (401 Unauthorized)',
  ])('recognizes an interactive Azure session failure: %s', (message) => {
    expect(isAzureAuthError(message)).toBe(true);
  });

  it.each([
    'Error from server (Forbidden): pods is forbidden: User cannot list resource pods',
    'Unable to connect to the server: dial tcp: network is unreachable',
    'kubectl timed out after 120s',
    'x509: certificate signed by unknown authority',
    'the server does not have a resource type deployments',
  ])('does not misclassify non-session failures: %s', (message) => {
    expect(isAzureAuthError(message)).toBe(false);
  });
});
