const steps = "test/features/steps/mjs";
const common = { format: ["progress"] };

export default {
  ...common,
  import: [`${steps}/!(interoperability).mjs`],
  paths: ["test/features/shared/**/*.feature"],
};

export const interoperability = {
  ...common,
  paths: ["test/features/interoperability.feature"],
  import: [`${steps}/*.mjs`],
};
