module.exports = function (api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo'], 'nativewind/babel'],

    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],

          alias: {
            // '@/*' is resolved by metro via tsconfig `paths` (→ ./src/* then ./*),
            // which is the only mapping that satisfies this repo's mixed layout
            // (files under src/ plus root-level components/). A competing babel
            // alias here rewrites '@' to the project root only and breaks it.
            'tailwind.config': './tailwind.config.js',
          },
        },
      ],
      'react-native-worklets/plugin',
    ],
  };
};
