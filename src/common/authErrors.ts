export function isAzureAuthError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('aadsts')
    || normalized.includes("run 'az login'")
    || normalized.includes('run az login')
    || normalized.includes('azureclicredential')
    || (
      normalized.includes('kubelogin')
      && (
        normalized.includes('token')
        || normalized.includes('interaction_required')
        || normalized.includes('interaction required')
        || normalized.includes('expired')
      )
    )
    || normalized.includes('401 unauthorized')
    || normalized.includes('client to provide credentials');
}
