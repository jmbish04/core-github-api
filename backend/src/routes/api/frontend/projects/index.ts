/**
 * @file index.ts
 * @description Main entry point for the projects API domain.
 * Aggregates and mounts sub-modules for favorites, actions, infrastructure, and more.
 */

import { Hono } from "hono";
import base from "./base";
import favorites from "./favorites";
import actions from "./actions";
import infrastructure from "./infrastructure";
import planner from "./planner";
import hierarchy from "./hierarchy";

const app = new Hono<{ Bindings: Env }>();

/**
 * Mount sub-modules to their respective sub-paths.
 */
app.route("/", base);
app.route("/favorites", favorites);
app.route("/actions", actions);
app.route("/infrastructure", infrastructure);
app.route("/planner", planner);
app.route("/hierarchy", hierarchy);

export default app;
