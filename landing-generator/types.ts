/**
 * Type definitions for Landing Page Generator
 */

// Configuration Types
export interface WranglerConfig {
  name?: string;
  durable_objects?: {
    bindings?: Array<{
      name: string;
      class_name: string;
    }>;
  };
  d1_databases?: Array<{
    binding: string;
    database_name: string;
    database_id?: string;
    migrations_dir?: string;
  }>;
  kv_namespaces?: Array<{
    binding: string;
    id?: string;
    preview_id?: string;
  }>;
  queues?: {
    producers?: Array<{
      binding: string;
      queue: string;
    }>;
    consumers?: Array<{
      queue: string;
      max_batch_size?: number;
    }>;
  };
  workflows?: Array<{
    name: string;
    binding: string;
    class_name: string;
  }>;
  ai?: {
    binding: string;
  };
}

export interface PackageJson {
  name?: string;
  description?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface OpenAPISpec {
  paths?: Record<string, Record<string, {
    summary?: string;
    description?: string;
    tags?: string[];
  }>>;
  tags?: Array<{
    name: string;
    description?: string;
  }>;
}

// Analysis Types
export interface WorkerAnalysis {
  name: string;
  description: string;
  purpose: {
    headline: string;
    tagline: string;
    valueStatement: string;
  };
  components: ArchitectureComponent[];
  features: string[];
  endpoints: Endpoint[];
  painPoints: PainPoint[];
  metrics: Metric[];
  techStack: string[];
  branding?: {
    icon: string;
    displayName: string;
  };
  links?: {
    primary: { text: string; href: string };
    secondary: { text: string; href: string };
    footer?: Array<{ text: string; href: string }>;
  };
  colors?: ColorScheme;
}

export interface ArchitectureComponent {
  type: string;
  name: string;
  description: string;
  icon: string;
}

export interface Endpoint {
  path: string;
  method: string;
  description: string;
}

export interface PainPoint {
  title: string;
  description: string;
  solution: string;
}

export interface Metric {
  value: string;
  label: string;
  trend: 'positive' | 'neutral' | 'negative';
}

export interface ColorScheme {
  primary: {
    from: string;
    to: string;
  };
  secondary: {
    from: string;
    to: string;
  };
  neutral: string;
}

export interface ContentBlueprint {
  hero: HeroSection;
  problem: ProblemSection;
  solution: SolutionSection;
  features: FeatureSection;
  metrics: MetricsSection;
  useCases: UseCaseSection;
  roadmap: RoadmapSection;
  cta: CTASection;
}

export interface HeroSection {
  headline: string;
  subheadline: string;
  primaryCTA: { text: string; href: string };
  secondaryCTA: { text: string; href: string };
  liveStats?: Array<{ value: string; label: string }>;
}

export interface ProblemSection {
  title: string;
  cards: Array<{
    title: string;
    description: string;
    icon: string;
  }>;
}

export interface SolutionSection {
  title: string;
  description: string;
  architecture: {
    diagram: string; // ASCII or description
    components: Array<{ name: string; description: string }>;
  };
  highlights: string[];
}

export interface FeatureSection {
  title: string;
  cards: Array<{
    icon: string;
    title: string;
    description: string;
    tags: string[];
  }>;
}

export interface MetricsSection {
  title: string;
  stats: Array<{
    value: string;
    label: string;
    color: 'emerald' | 'indigo' | 'amber';
  }>;
}

export interface UseCaseDetails {
  persona: string;
  scenario: string;
  outcome: string;
}

export interface UseCaseSection {
  title: string;
  cases: UseCaseDetails[];
}

export interface RoadmapMilestone {
  version: string;
  title: string;
  items: string[];
  status: 'completed' | 'in-progress' | 'planned';
}

export interface RoadmapSection {
  title: string;
  milestones: RoadmapMilestone[];
}

export interface CTASection {
  tagline: string;
  buttons: Array<{ text: string; href: string; variant: 'primary' | 'secondary' }>;
}
