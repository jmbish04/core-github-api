/**
 * HTML Template Generator - Creates cinematic landing page with Tailwind
 */

// Handlebars imported dynamically in initialize method
import type { ContentBlueprint } from './types';

// Import templates directly
import landingTemplate from '@/services/landing-generator/templates/landing.hbs';
import navPartial from '@/services/landing-generator/templates/partials/nav.hbs';
import heroPartial from '@/services/landing-generator/templates/partials/hero.hbs';
import problemPartial from '@/services/landing-generator/templates/partials/problem.hbs';
import solutionPartial from '@/services/landing-generator/templates/partials/solution.hbs';
import featuresPartial from '@/services/landing-generator/templates/partials/features.hbs';
import metricsPartial from '@/services/landing-generator/templates/partials/metrics.hbs';
import useCasesPartial from '@/services/landing-generator/templates/partials/use_cases.hbs';
import roadmapPartial from '@/services/landing-generator/templates/partials/roadmap.hbs';
import ctaPartial from '@/services/landing-generator/templates/partials/cta.hbs';
import footerPartial from '@/services/landing-generator/templates/partials/footer.hbs';

let mainTemplate: any = null;

async function initHandlebars() {
    if (mainTemplate) return;

    const { default: Handlebars } = await import('handlebars');

    // Register Partials
    Handlebars.registerPartial('nav', navPartial);
    Handlebars.registerPartial('hero', heroPartial);
    Handlebars.registerPartial('problem', problemPartial);
    Handlebars.registerPartial('solution', solutionPartial);
    Handlebars.registerPartial('features', featuresPartial);
    Handlebars.registerPartial('metrics', metricsPartial);
    Handlebars.registerPartial('use_cases', useCasesPartial);
    Handlebars.registerPartial('roadmap', roadmapPartial);
    Handlebars.registerPartial('cta', ctaPartial);
    Handlebars.registerPartial('footer', footerPartial);

    // Register Helpers
    Handlebars.registerHelper('eq', function (a, b) {
        return a === b;
    });

    // Compile Main Template
    mainTemplate = Handlebars.compile(landingTemplate);
}

export class TemplateGenerator {
    /**
     * Generate complete HTML page from content blueprint
     */
    static async generate(
        blueprint: ContentBlueprint,
        workerName: string,
        branding?: { icon: string; displayName: string },
        footerLinks?: Array<{ text: string; href: string }>
    ): Promise<string> {
        await initHandlebars();
        const brandIcon = branding?.icon || '⚡';
        const brandName = branding?.displayName || workerName;

        const data = {
            brandIcon,
            brandName,
            year: new Date().getFullYear(),
            footerLinks: footerLinks || [
                { text: 'API Documentation', href: '/doc' },
                { text: 'OpenAPI Spec', href: '/openapi.json' },
                { text: 'OpenAPI YAML', href: '/openapi.yaml' },
            ],
            scrollScript: this.generateScrollScript(),

            // Sections from blueprint
            hero: blueprint.hero,
            problem: blueprint.problem,
            solution: blueprint.solution,
            features: blueprint.features,
            metrics: blueprint.metrics,
            useCases: blueprint.useCases,
            roadmap: blueprint.roadmap,
            cta: blueprint.cta,
        };

        return mainTemplate(data);
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
