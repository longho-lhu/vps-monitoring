module.exports = {
    apps: [
        {
            name: 'VPS-monitor',
            cwd: './',
            script: 'node_modules/next/dist/bin/next',
            args: 'start -p 3232',
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};