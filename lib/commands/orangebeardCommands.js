Cypress.Commands.overwrite('log', (originalFn, ...args) => {
    const message = args.reduce((result, logItem) => {
        if (typeof logItem === 'object') {
            return [result, JSON.stringify(logItem)].join(' ');
        }

        return [result, logItem ? logItem.toString() : ''].join(' ');
    }, '');
    cy.task('orangebeard_log', {
        level: 'info',
        message,
    });
    originalFn(...args);
});
