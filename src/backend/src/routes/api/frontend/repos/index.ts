import { Hono } from "hono";
import base from "./base";
import favorites from "./favorites";
import actions from "./actions";
import infrastructure from "./infrastructure";
import planner from "./planner";
import hierarchy from "./hierarchy";
import statsRouter from "../stats";

const app = new Hono<{ Bindings: Env }>();

/**
 * Mount sub-modules to their respective sub-paths.
 */
app.route("/", base);
app.route("/favorites", favorites);
app.route("/", actions);
app.route("/", infrastructure);
app.route("/", planner);
app.route("/", hierarchy);
app.route("/stats", statsRouter);

export default app;
