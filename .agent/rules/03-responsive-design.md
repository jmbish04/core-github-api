# Rule: Mobile-First Responsive Design

## Core Directive
All UI generation and modification must adhere to a strict mobile-first responsive design pattern. The application shell (Sidebar) handles its own responsive state, but all internal page views and components must adapt smoothly to smaller viewports.

## 1. Container Widths (Fluid Layouts)
- **NEVER** hardcode fixed pixel widths for layout containers (e.g., do not use `w-[800px]`).
- **ALWAYS** use Tailwind's responsive utility classes such as `w-full`, `max-w-7xl`, or percentage-based widths that scale up on larger breakpoints (e.g., `w-full md:w-1/2`).

## 2. Flex and Grid Layouts
- All grid and flex layouts MUST specify behavior for the base (mobile) breakpoint and scale up using `md:` or `lg:` prefixes.
- **Example:** Use `flex-col md:flex-row` instead of just `flex`.
- **Example:** Use `grid-cols-1 md:grid-cols-3` instead of `grid-cols-3`.

## 3. Data Tables and Wide Elements
- Data tables, grids, and abnormally wide elements MUST be wrapped in an `overflow-x-auto` container.
- This prevents the table from breaking the mobile viewport width, allowing users to scroll horizontally while the rest of the page remains contained.

## 4. Touch Targets
- Ensure buttons, links, and inputs are adequately sized for mobile touch interaction. Do not squish interactive elements.
