
import { getOctokit } from "../octokit/core";
import _sodium from "libsodium-wrappers";


/**
 * Encrypt a secret value using LibSodium for GitHub Actions Secrets.
 * 
 * GitHub requires the secret to be encrypted using the repo's public key.
 * The value is a Base64 encoded string of the encrypted box.
 */
async function encryptSecret(
  sodium: typeof _sodium,
  key: string,
  value: string
): Promise<string> {
  // Convert the key and verify
  const binkey = sodium.from_base64(key, _sodium.base64_variants.ORIGINAL);
  const binsec = sodium.from_string(value);

  // Encrypt
  const encBytes = sodium.crypto_box_seal(binsec, binkey);

  // Convert to Base64
  return sodium.to_base64(encBytes, _sodium.base64_variants.ORIGINAL);
}

export interface SecretDefinition {
  name: string;
  value: string;
}

export async function syncRepoSecrets(
  env: Env,
  owner: string,
  repo: string,
  secrets: SecretDefinition[]
) {
  const octokit = await getOctokit(env);
  await _sodium.ready;
  const sodium = _sodium;

  // 1. Get the repository public key
  // https://docs.github.com/en/rest/actions/secrets?apiVersion=2022-11-28#get-a-repository-public-key
  const { data: publicKey } = await octokit.rest.actions.getRepoPublicKey({
    owner,
    repo,
  });

  const keyId = publicKey.key_id;
  const key = publicKey.key;

  const results = [];

  // 2. Encrypt and set each secret
  for (const secret of secrets) {
    try {
      const encryptedValue = await encryptSecret(sodium, key, secret.value);
      
      // https://docs.github.com/en/rest/actions/secrets?apiVersion=2022-11-28#create-or-update-a-repository-secret
      await octokit.rest.actions.createOrUpdateRepoSecret({
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
