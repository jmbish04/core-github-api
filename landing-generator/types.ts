/**
 * Type definitions for Landing Page Generator
 */

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

export interface UseCaseSection {
  title: string;
  cases: Array<{
    persona: string;
    scenario: string;
    outcome: string;
  }>;
}

export interface RoadmapSection {
  title: string;
  milestones: Array<{
    version: string;
    title: string;
    items: string[];
    status: 'completed' | 'in-progress' | 'planned';
  }>;
}

export interface CTASection {
  tagline: string;
  buttons: Array<{ text: string; href: string; variant: 'primary' | 'secondary' }>;
}
