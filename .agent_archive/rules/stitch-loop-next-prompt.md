---
trigger: always_on
---

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Stitch Baton Prompt Schema",
  "description": "Schema for the .stitch/next-prompt.md file to ensure agent compliance with the Monolith Design System.",
  "type": "object",
  "required": ["page", "status", "prompt_content"],
  "properties": {
    "page": {
      "type": "string",
      "description": "The target filename without extension (e.g., 'dashboard'). Must exist in SITE.md."
    },
    "status": {
      "type": "string",
      "enum": ["todo", "in-progress", "review", "done"],
      "default": "todo"
    },
    "prompt_content": {
      "type": "object",
      "required": ["description", "design_system", "page_structure", "technical_requirements"],
      "properties": {
        "description": {
          "type": "string",
          "description": "One-line purpose with vibe keywords (Brutalist, Obsidian, Tonal, Asymmetric)."
        },
        "design_system": {
          "type": "object",
          "description": "Strict adherence to DESIGN.md Section 6.",
          "required": ["constraints", "palette"],
          "properties": {
            "constraints": {
              "type": "array",
              "items": { "type": "string" },
              "default": [
                "Strict No-Line Rule: Forbidden to use 1px solid borders for containment.",
                "System-First Interface: NO user icons or profiles anywhere.",
                "No Search: Layout must be intuitive enough that search inputs are unnecessary.",
                "Collapsible Sidebar: The shadcn/ui sidebar must be available and collapsible on every page."
              ]
            },
            "palette": {
              "type": "string",
              "default": "Zinc Dark / Obsidian scale using OKLCH(0.145 0 0) background."
            }
          }
        },
        "page_structure": {
          "type": "array",
          "description": "Numbered sections to build.",
          "items": { "type": "string" },
          "minItems": 3
        },
        "technical_requirements": {
          "type": "array",
          "description": "Specific Shadcn components or Cloudflare bindings.",
          "items": { "type": "string" },
          "default": ["shadcn/ui Sidebar (Collapsible)", "assistant-ui Thread (if applicable)"]
        }
      }
    }
  }
}