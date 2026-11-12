/** Options du journal Fastify (pino) : `niveau` = 'silent' en test. */
export function optionsJournal(niveau: string = process.env['CANAPE_JOURNAL'] || 'info') {
  return { level: niveau, redact: ['req.headers.cookie', 'req.headers.authorization'] };
}
