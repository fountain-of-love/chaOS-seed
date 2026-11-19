const common = { import: ["test/steps/*.mjs"], format: ["progress"] };

export default {
  ...common,
  paths: ["test/features/shared/**/*.feature"],
};

export const interoperability = {
  ...common,
  paths: ["test/features/interoperability.feature"],
  import: [...common.import, "test/interop/*.mjs"],
};
