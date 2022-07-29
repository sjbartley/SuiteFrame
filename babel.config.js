module.exports = {
    presets: [
        ["@babel/preset-typescript", {}],
        ["@babel/preset-env", {
            useBuiltIns: false,
            targets: {
                rhino: "1.7.13"
            }
        }
        ]
    ],
    plugins: [
        ["@babel/plugin-proposal-optional-chaining", {}],
        ["@babel/plugin-proposal-nullish-coalescing-operator", {}],
        ["@babel/plugin-proposal-decorators", { decoratorsBeforeExport: true }],
        ["@babel/plugin-proposal-class-properties", {}]
    ]
};
