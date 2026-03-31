import { 
  normalizeProvider, 
  normalizeWorkerAiModel, 
  normalizeModelForGateway 
} from './normalize';
import { getBaseUrl } from './normalize';
import { 
  getApiKeyForProvider, 
  verifyProviderApiKey 
} from './keys';
import { checkAIGatewayHealth } from './health';

export class AIGateway {
  public static getBaseUrl = getBaseUrl;
  public static getApiKeyForProvider = getApiKeyForProvider;
  public static verifyProviderApiKey = verifyProviderApiKey;
  public static checkAIGatewayHealth = checkAIGatewayHealth;
  public static normalizeProvider = normalizeProvider;
  public static normalizeWorkerAiModel = normalizeWorkerAiModel;
  public static normalizeModelForGateway = normalizeModelForGateway;
}
