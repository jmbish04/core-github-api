/**
 * HTML Template Generator - Creates cinematic landing page with Tailwind
 */

import type { ContentBlueprint } from './types';

export class TemplateGenerator {
  /**
   * Generate complete HTML page from content blueprint
   */
  static generate(blueprint: ContentBlueprint, workerName: string): string {
    return `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${workerName} - Cloudflare Worker</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">

    <style>
        * {
            font-family: 'Inter', sans-serif;
        }

        .fade-in-up {
            opacity: 0;
            transform: translateY(30px);
            transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }

        .fade-in-up.visible {
            opacity: 1;
            transform: translateY(0);
        }

        .gradient-hero {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .gradient-cta {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }

        .glass-nav {
            backdrop-filter: blur(12px);
            background: rgba(255, 255, 255, 0.9);
            border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }

        .code-block {
            background: #1e293b;
            border-radius: 8px;
            padding: 1rem;
            overflow-x: auto;
        }

        .code-block pre {
            color: #e2e8f0;
            font-family: 'Courier New', monospace;
            font-size: 0.875rem;
            line-height: 1.6;
            margin: 0;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
        }

        .float-anim {
            animation: float 3s ease-in-out infinite;
        }
    </style>
</head>
<body class="bg-white text-slate-900" x-data="{ mobileMenuOpen: false }">

    ${this.generateNav(blueprint)}

    ${this.generateHero(blueprint.hero)}

    ${this.generateProblem(blueprint.problem)}

    ${this.generateSolution(blueprint.solution)}

    ${this.generateFeatures(blueprint.features)}

    ${this.generateMetrics(blueprint.metrics)}

    ${this.generateUseCases(blueprint.useCases)}

    ${this.generateRoadmap(blueprint.roadmap)}

    ${this.generateCTA(blueprint.cta)}

    ${this.generateFooter(workerName)}

    ${this.generateScrollScript()}

</body>
</html>`;
  }

  private static generateNav(blueprint: ContentBlueprint): string {
    return `
    <!-- Sticky Glass Navigation -->
    <nav class="glass-nav fixed top-0 left-0 right-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center space-x-2">
                    <div class="text-2xl">⚡</div>
                    <span class="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        CloudflareWorker
                    </span>
                </div>

                <!-- Desktop Nav -->
                <div class="hidden md:flex items-center space-x-8">
                    <a href="#problem" class="text-slate-600 hover:text-indigo-600 transition">Challenge</a>
                    <a href="#solution" class="text-slate-600 hover:text-indigo-600 transition">Solution</a>
                    <a href="#features" class="text-slate-600 hover:text-indigo-600 transition">Features</a>
                    <a href="#roadmap" class="text-slate-600 hover:text-indigo-600 transition">Roadmap</a>
                    <a href="${blueprint.hero.primaryCTA.href}"
                       class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
                        ${blueprint.hero.primaryCTA.text}
                    </a>
                </div>

                <!-- Mobile Menu Button -->
                <button @click="mobileMenuOpen = !mobileMenuOpen" class="md:hidden text-slate-600">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                    </svg>
                </button>
            </div>

            <!-- Mobile Menu -->
            <div x-show="mobileMenuOpen"
                 x-transition
                 class="md:hidden pb-4 space-y-2">
                <a href="#problem" class="block px-4 py-2 text-slate-600 hover:bg-slate-50 rounded">Challenge</a>
                <a href="#solution" class="block px-4 py-2 text-slate-600 hover:bg-slate-50 rounded">Solution</a>
                <a href="#features" class="block px-4 py-2 text-slate-600 hover:bg-slate-50 rounded">Features</a>
                <a href="#roadmap" class="block px-4 py-2 text-slate-600 hover:bg-slate-50 rounded">Roadmap</a>
            </div>
        </div>
    </nav>`;
  }

  private static generateHero(hero: import('./types').HeroSection): string {
    const statsHTML = hero.liveStats ? hero.liveStats.map((stat: any) => `
                    <div class="text-center">
                        <div class="text-3xl font-bold text-white">${stat.value}</div>
                        <div class="text-indigo-200 text-sm mt-1">${stat.label}</div>
                    </div>
    `).join('') : '';

    return `
    <!-- Hero Section -->
    <section id="hero" class="gradient-hero pt-32 pb-20 relative overflow-hidden">
        <div class="absolute inset-0 opacity-10">
            <div class="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl"></div>
            <div class="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div class="text-center fade-in-up">
                <h1 class="text-5xl md:text-7xl font-black text-white mb-6 leading-tight">
                    ${hero.headline}
                </h1>
                <p class="text-xl md:text-2xl text-indigo-100 mb-10 max-w-3xl mx-auto leading-relaxed">
                    ${hero.subheadline}
                </p>

                <div class="flex flex-col sm:flex-row gap-4 justify-center mb-16">
                    <a href="${hero.primaryCTA.href}"
                       class="px-8 py-4 bg-white text-indigo-600 rounded-lg font-semibold text-lg hover:bg-indigo-50 transition shadow-xl">
                        ${hero.primaryCTA.text}
                    </a>
                    <a href="${hero.secondaryCTA.href}"
                       class="px-8 py-4 bg-indigo-800 bg-opacity-50 text-white rounded-lg font-semibold text-lg hover:bg-opacity-70 transition border-2 border-white border-opacity-20">
                        ${hero.secondaryCTA.text}
                    </a>
                </div>

                ${statsHTML ? `
                <div class="grid grid-cols-3 gap-8 max-w-2xl mx-auto pt-8 border-t border-white border-opacity-20">
                    ${statsHTML}
                </div>
                ` : ''}
            </div>
        </div>
    </section>`;
  }

  private static generateProblem(problem: any): string {
    const cardsHTML = problem.cards.map((card: any) => `
                <div class="fade-in-up bg-white p-8 rounded-xl shadow-lg border border-slate-200 hover:shadow-xl transition">
                    <div class="text-4xl mb-4">${card.icon}</div>
                    <h3 class="text-xl font-bold text-slate-900 mb-3">${card.title}</h3>
                    <p class="text-slate-600 leading-relaxed">${card.description}</p>
                </div>
    `).join('');

    return `
    <!-- Problem Section -->
    <section id="problem" class="py-20 bg-slate-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16 fade-in-up">
                <h2 class="text-4xl md:text-5xl font-black text-slate-900 mb-4">${problem.title}</h2>
                <div class="w-24 h-1 bg-gradient-to-r from-indigo-600 to-purple-600 mx-auto"></div>
            </div>

            <div class="grid md:grid-cols-3 gap-8">
                ${cardsHTML}
            </div>
        </div>
    </section>`;
  }

  private static generateSolution(solution: any): string {
    const componentsHTML = solution.architecture.components.slice(0, 4).map((comp: any) => `
                    <li class="flex items-start space-x-3">
                        <svg class="w-6 h-6 text-emerald-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                        <div>
                            <span class="font-semibold text-slate-900">${comp.name}</span>
                            <span class="text-slate-600"> - ${comp.description}</span>
                        </div>
                    </li>
    `).join('');

    const highlightsHTML = solution.highlights.map((h: string) => `
                    <li class="flex items-start space-x-3">
                        <span class="text-indigo-600 text-xl">✓</span>
                        <span class="text-slate-700">${h}</span>
                    </li>
    `).join('');

    return `
    <!-- Solution Section -->
    <section id="solution" class="py-20 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16 fade-in-up">
                <h2 class="text-4xl md:text-5xl font-black text-slate-900 mb-4">${solution.title}</h2>
                <p class="text-xl text-slate-600 max-w-3xl mx-auto">${solution.description}</p>
            </div>

            <div class="grid lg:grid-cols-2 gap-12 items-start">
                <!-- Architecture Diagram -->
                <div class="fade-in-up">
                    <div class="code-block float-anim">
                        <pre>${solution.architecture.diagram}</pre>
                    </div>
                </div>

                <!-- Components & Highlights -->
                <div class="fade-in-up space-y-8">
                    <div>
                        <h3 class="text-2xl font-bold text-slate-900 mb-6">Architecture Components</h3>
                        <ul class="space-y-4">
                            ${componentsHTML}
                        </ul>
                    </div>

                    <div>
                        <h3 class="text-2xl font-bold text-slate-900 mb-6">Key Benefits</h3>
                        <ul class="space-y-3">
                            ${highlightsHTML}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </section>`;
  }

  private static generateFeatures(features: any): string {
    const cardsHTML = features.cards.map((card: any) => `
                <div class="fade-in-up bg-gradient-to-br from-white to-indigo-50 p-8 rounded-xl shadow-lg hover:shadow-2xl transition border border-indigo-100">
                    <div class="text-5xl mb-4">${card.icon}</div>
                    <h3 class="text-2xl font-bold text-slate-900 mb-3">${card.title}</h3>
                    <p class="text-slate-700 mb-4 leading-relaxed">${card.description}</p>
                    ${card.tags.length > 0 ? `
                    <div class="flex flex-wrap gap-2">
                        ${card.tags.map((tag: string) => `
                        <span class="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">${tag}</span>
                        `).join('')}
                    </div>
                    ` : ''}
                </div>
    `).join('');

    return `
    <!-- Features Section -->
    <section id="features" class="py-20 bg-indigo-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16 fade-in-up">
                <h2 class="text-4xl md:text-5xl font-black text-slate-900 mb-4">${features.title}</h2>
                <div class="w-24 h-1 bg-gradient-to-r from-indigo-600 to-purple-600 mx-auto"></div>
            </div>

            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                ${cardsHTML}
            </div>
        </div>
    </section>`;
  }

  private static generateMetrics(metrics: any): string {
    const statsHTML = metrics.stats.map((stat: any) => `
                <div class="fade-in-up text-center">
                    <div class="inline-block px-6 py-3 bg-${stat.color}-100 rounded-xl mb-3">
                        <div class="text-4xl md:text-5xl font-black text-${stat.color}-600">${stat.value}</div>
                    </div>
                    <div class="text-lg font-semibold text-slate-700">${stat.label}</div>
                </div>
    `).join('');

    return `
    <!-- Metrics Section -->
    <section id="metrics" class="py-20 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16 fade-in-up">
                <h2 class="text-4xl md:text-5xl font-black text-slate-900 mb-4">${metrics.title}</h2>
                <div class="w-24 h-1 bg-gradient-to-r from-emerald-600 to-teal-600 mx-auto"></div>
            </div>

            <div class="grid md:grid-cols-3 gap-12">
                ${statsHTML}
            </div>
        </div>
    </section>`;
  }

  private static generateUseCases(useCases: any): string {
    const casesHTML = useCases.cases.map((useCase: any) => `
                <div class="fade-in-up bg-white p-8 rounded-xl shadow-lg border-l-4 border-emerald-500 hover:shadow-xl transition">
                    <div class="text-sm font-semibold text-emerald-600 mb-2 uppercase tracking-wide">${useCase.persona}</div>
                    <h3 class="text-xl font-bold text-slate-900 mb-3">${useCase.scenario}</h3>
                    <p class="text-slate-600 leading-relaxed"><span class="font-semibold text-emerald-600">Result:</span> ${useCase.outcome}</p>
                </div>
    `).join('');

    return `
    <!-- Use Cases Section -->
    <section id="use-cases" class="py-20 bg-emerald-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16 fade-in-up">
                <h2 class="text-4xl md:text-5xl font-black text-slate-900 mb-4">${useCases.title}</h2>
                <div class="w-24 h-1 bg-gradient-to-r from-emerald-600 to-teal-600 mx-auto"></div>
            </div>

            <div class="grid md:grid-cols-3 gap-8">
                ${casesHTML}
            </div>
        </div>
    </section>`;
  }

  private static generateRoadmap(roadmap: any): string {
    const milestonesHTML = roadmap.milestones.map((milestone: any, index: number) => {
      const statusColors = {
        completed: 'emerald',
        'in-progress': 'indigo',
        planned: 'slate',
      };
      const color = statusColors[milestone.status];

      return `
                <div class="fade-in-up relative">
                    ${index < roadmap.milestones.length - 1 ? `
                    <div class="hidden md:block absolute top-16 left-1/2 w-full h-0.5 bg-${color}-200"></div>
                    ` : ''}

                    <div class="relative z-10 text-center">
                        <div class="inline-block px-6 py-3 bg-${color}-600 text-white rounded-full font-bold text-lg mb-4">
                            ${milestone.version}
                        </div>
                        <h3 class="text-2xl font-bold text-slate-900 mb-4">${milestone.title}</h3>
                        <div class="bg-white p-6 rounded-xl shadow-lg border border-${color}-100">
                            <ul class="space-y-2 text-left">
                                ${milestone.items.map((item: string) => `
                                <li class="flex items-start space-x-2">
                                    <span class="text-${color}-600 mt-1">•</span>
                                    <span class="text-slate-700">${item}</span>
                                </li>
                                `).join('')}
                            </ul>
                        </div>
                        <div class="mt-4">
                            <span class="px-4 py-2 bg-${color}-100 text-${color}-700 rounded-full text-sm font-semibold uppercase">
                                ${milestone.status.replace('-', ' ')}
                            </span>
                        </div>
                    </div>
                </div>
      `;
    }).join('');

    return `
    <!-- Roadmap Section -->
    <section id="roadmap" class="py-20 bg-slate-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16 fade-in-up">
                <h2 class="text-4xl md:text-5xl font-black text-slate-900 mb-4">${roadmap.title}</h2>
                <div class="w-24 h-1 bg-gradient-to-r from-indigo-600 to-purple-600 mx-auto"></div>
            </div>

            <div class="grid md:grid-cols-3 gap-12">
                ${milestonesHTML}
            </div>
        </div>
    </section>`;
  }

  private static generateCTA(cta: any): string {
    const buttonsHTML = cta.buttons.map((btn: any) => {
      const styles = btn.variant === 'primary'
        ? 'px-8 py-4 bg-white text-emerald-600 rounded-lg font-semibold text-lg hover:bg-emerald-50 transition shadow-xl'
        : 'px-8 py-4 bg-emerald-800 bg-opacity-50 text-white rounded-lg font-semibold text-lg hover:bg-opacity-70 transition border-2 border-white border-opacity-20';

      return `
                    <a href="${btn.href}" class="${styles}">
                        ${btn.text}
                    </a>
      `;
    }).join('');

    return `
    <!-- CTA Section -->
    <section id="cta" class="gradient-cta py-20 relative overflow-hidden">
        <div class="absolute inset-0 opacity-10">
            <div class="absolute top-10 right-10 w-64 h-64 bg-white rounded-full blur-3xl"></div>
            <div class="absolute bottom-10 left-10 w-80 h-80 bg-white rounded-full blur-3xl"></div>
        </div>

        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center fade-in-up">
            <h2 class="text-4xl md:text-6xl font-black text-white mb-8 leading-tight">
                ${cta.tagline}
            </h2>
            <div class="flex flex-col sm:flex-row gap-4 justify-center">
                ${buttonsHTML}
            </div>
        </div>
    </section>`;
  }

  private static generateFooter(workerName: string): string {
    return `
    <!-- Footer -->
    <footer class="bg-slate-900 text-slate-400 py-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="grid md:grid-cols-3 gap-8 mb-8">
                <div>
                    <div class="flex items-center space-x-2 mb-4">
                        <span class="text-xl font-bold text-white">${workerName}</span>
                    </div>
                    <p class="text-sm">Built on Cloudflare Workers, powered by edge computing.</p>
                </div>

                <div>
                    <h3 class="text-white font-semibold mb-4">Documentation</h3>
                    <ul class="space-y-2 text-sm">
                        <li><a href="/doc" class="hover:text-white transition">API Documentation</a></li>
                        <li><a href="/openapi.json" class="hover:text-white transition">OpenAPI Spec</a></li>
                        <li><a href="/openapi.yaml" class="hover:text-white transition">YAML Spec</a></li>
                    </ul>
                </div>

                <div>
                    <h3 class="text-white font-semibold mb-4">Resources</h3>
                    <ul class="space-y-2 text-sm">
                        <li><a href="https://developers.cloudflare.com/workers/" class="hover:text-white transition">Cloudflare Workers Docs</a></li>
                        <li><a href="https://workers.cloudflare.com" class="hover:text-white transition">Workers Platform</a></li>
                    </ul>
                </div>
            </div>

            <div class="border-t border-slate-800 pt-8 text-center text-sm">
                <p>&copy; ${new Date().getFullYear()} ${workerName}. Auto-generated landing page.</p>
            </div>
        </div>
    </footer>`;
  }

  private static generateScrollScript(): string {
    return `
    <script>
        // Scroll Animation Observer
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, observerOptions);

        // Observe all fade-in-up elements
        document.addEventListener('DOMContentLoaded', () => {
            const elements = document.querySelectorAll('.fade-in-up');
            elements.forEach(el => observer.observe(el));

            // Trigger first viewport immediately
            setTimeout(() => {
                elements.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.top < window.innerHeight) {
                        el.classList.add('visible');
                    }
                });
            }, 100);
        });

        // Smooth scroll for navigation
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    </script>`;
  }
}
