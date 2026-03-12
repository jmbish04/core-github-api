import sodium from 'libsodium-wrappers';
import { getOctokit } from '../octokit/core';

export interface SecretDefinition {
  name: string;
  value: string;
}

async function encryptSecret(key: string, secret: string): Promise<string> {
  await sodium.ready;
  const binKey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
  const binSecret = sodium.from_string(secret);
  const encBytes = sodium.crypto_box_seal(binSecret, binKey);
  return sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);
}

export async function putRepositorySecret(
  octokit: any,
  owner: string,
  repo: string,
  secretName: string,
  secretValue: string,
): Promise<void> {
  const { data: publicKeyInfo } = await octokit.rest.actions.getRepoPublicKey({
    owner,
    repo,
  });

  const encryptedValue = await encryptSecret(publicKeyInfo.key, secretValue);

  await octokit.rest.actions.createOrUpdateRepoSecret({
    owner,
    repo,
    secret_name: secretName,
    encrypted_value: encryptedValue,
    key_id: publicKeyInfo.key_id,
  });
}

export async function syncRepoSecrets(
  env: Env,
  owner: string,
  repo: string,
  secrets: SecretDefinition[],
  octokit?: any,
) {
  const github = octokit ?? (await getOctokit(env));
  const { data: publicKey } = await github.rest.actions.getRepoPublicKey({
    owner,
    repo,
  });

  const results: Array<{ name: string; status: 'updated' | 'error'; error?: string }> = [];

  for (const secret of secrets) {
    try {
      const encryptedValue = await encryptSecret(publicKey.key, secret.value);
      await github.rest.actions.createOrUpdateRepoSecret({
        owner,
        repo,
        secret_name: secret.name,
        encrypted_value: encryptedValue,
        key_id: publicKey.key_id,
      });
      results.push({ name: secret.name, status: 'updated' });
    } catch (error: any) {
      console.error(`Failed to set secret ${secret.name}:`, error);
      results.push({
        name: secret.name,
        status: 'error',
        error: error.message,
      });
    }
  }

  return results;
}
