
import { getOctokit } from "../octokit/core";
// // REMOVED


/**
 * Encrypt a secret using libsodium (used by GitHub for secret updates)
 */
async function encryptSecret(
  key: string,
  secret: string,
  sodium: any,
): Promise<string> {
  // Convert the secret and key to a Uint8Array.
  const binkey = sodium.from_base64(key, 1); // 1 = _sodium.base64_variants.ORIGINAL
  const binsec = sodium.from_string(secret);

  // Encrypt the secret using libsodium
  const encBytes = sodium.crypto_box_seal(binsec, binkey);

  // Convert the encrypted Uint8Array to Base64
  return sodium.to_base64(encBytes, 1);
}

export interface SecretDefinition {
  name: string;
  value: string;
}

export async function putRepositorySecret(
  octokit: any, // Assuming Octokit type is available or can be 'any' for now
  owner: string,
  repo: string,
  secretName: string,
  secretValue: string,
): Promise<void> {
  // 1. Get the public key for the repository
  const { data: publicKeyInfo } = await octokit.rest.actions.getRepoPublicKey({
    owner,
    repo,
  });

  // 2. Initialize libsodium
  const _sodium: any = {}; // Mock
  await _sodium.ready;
  const sodium = _sodium;

  const keyId = publicKeyInfo.key_id;
  const key = publicKeyInfo.key;

  const encryptedValue = await encryptSecret(key, secretValue, sodium);

  await octokit.rest.actions.createOrUpdateRepoSecret({
    owner,
    repo,
    secret_name: secretName,
    encrypted_value: encryptedValue,
    key_id: keyId,
  });
}

export async function syncRepoSecrets(
  env: Env,
  owner: string,
  repo: string,
  secrets: SecretDefinition[],
  octokit?: any
) {
  const github = octokit ?? await getOctokit(env);
  const _sodium: any = {}; // Mock
  await _sodium.ready;
  const sodium = _sodium;

  // 1. Get the repository public key
  // https://docs.github.com/en/rest/actions/secrets?apiVersion=2022-11-28#get-a-repository-public-key
  const { data: publicKey } = await github.rest.actions.getRepoPublicKey({
    owner,
    repo,
  });

  const keyId = publicKey.key_id;
  const key = publicKey.key;

  const results: any[] = [];

  // 2. Encrypt and set each secret
  for (const secret of secrets) {
    try {
      const encryptedValue = await encryptSecret(key, secret.value, sodium);
      
      // https://docs.github.com/en/rest/actions/secrets?apiVersion=2022-11-28#create-or-update-a-repository-secret
      await github.rest.actions.createOrUpdateRepoSecret({
        owner,
        repo,
        secret_name: secret.name,
        encrypted_value: encryptedValue,
        key_id: keyId,
      });
      
      results.push({ name: secret.name, status: "updated" });
    } catch (error: any) {
      console.error(`Failed to set secret ${secret.name}:`, error);
      results.push({ name: secret.name, status: "error", error: error.message });
    }
  }

  return results;
}
