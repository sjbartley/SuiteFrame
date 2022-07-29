/*jshint esversion:9*/
import { merge } from "webpack-merge";
import common from "./webpack.common.js";

const custom = { mode: "production" };
export default Array.isArray(common) ? common.map(c => merge(c, custom)) : merge(common, custom);
