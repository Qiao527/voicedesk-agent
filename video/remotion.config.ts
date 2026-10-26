import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Chrome for Testing is already on the sandbox image; use it instead of
// downloading a separate headless shell. Override with --browser-executable.
Config.setChromiumOpenGlRenderer("angle");
