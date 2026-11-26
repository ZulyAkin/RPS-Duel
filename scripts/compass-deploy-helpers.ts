import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { format } from 'util';

import { type Abi, type Hex, encodeDeployData, getCreate2Address } from 'viem';

export type DeployMode = 'fork' | 'live' | 'fork-then-live' | 'verify';
export type SignerKind = 'dcw' | 'private-key';

export interface CompiledArtifact {
  abi: unknown[];
  bytecode: Hex;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function coerceString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function stringifyForLog(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '[unserializable]';
  }
}

const SAFE_LOG_IDENTIFIER = /^(?:0x[0-9a-fA-F]{40}|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})$/;

export function sanitizeForLog(value: unknown): string {
  return stringifyForLog(value)
    .replace(/([?&]_rpc_token=)[^&"'\s]+/gi, '$1[redacted]')
    .replace(/\b[A-Za-z0-9+/=_-]{32,}\b/g, (m) => (SAFE_LOG_IDENTIFIER.test(m) ? m : '[redacted]'))
    .replace(/(api[_-]?key|secret|token|entity[_-]?secret)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 2_000);
}

export function redactRpcUrl(value: string): string {
  return value.replace(/([?&]_rpc_token=)[^&"'\s]+/gi, '$1[redacted]');
}

const MIN_REDACTED_SECRET_LENGTH = 8;

export function rpcTokenSecrets(rpcUrl: string, envToken: string | undefined): string[] {
  let urlToken: string | null = null;

  try {
    urlToken = new URL(rpcUrl).searchParams.get('_rpc_token');
  } catch {
    urlToken = null;
  }

  return [envToken, urlToken].filter(
    (secret): secret is string => typeof secret === 'string' && secret.length >= MIN_REDACTED_SECRET_LENGTH,
  );
}

export function redactSecrets(value: string, secrets: readonly string[]): string {
  return secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), redactRpcUrl(value));
}

type WriteFn = (chunk: unknown, ...rest: unknown[]) => boolean;
type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';

const CONSOLE_METHODS: readonly ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug'];

export function installOutputRedaction(secrets: readonly string[]): () => void {
  const redactChunk = (chunk: unknown): unknown => {
    if (typeof chunk === 'string') {
      return redactSecrets(chunk, secrets);
    }

    if (chunk instanceof Uint8Array) {
      const text = Buffer.from(chunk).toString('utf8');
      const redacted = redactSecrets(text, secrets);
      return redacted === text ? chunk : Buffer.from(redacted, 'utf8');
    }

    return chunk;
  };

  const restores = [process.stdout, process.stderr].map((stream) => {
    const ownWrite = Object.getOwnPropertyDescriptor(stream, 'write');
    const bound = stream.write.bind(stream) as WriteFn;
    stream.write = (chunk: unknown, ...rest: unknown[]) => bound(redactChunk(chunk), ...rest);
    return () => {
      if (ownWrite) {
        Object.defineProperty(stream, 'write', ownWrite);
      } else {
        Reflect.deleteProperty(stream, 'write');
      }
    };
  });

  for (const method of CONSOLE_METHODS) {
    const original = console[method];
    console[method] = (...args: unknown[]) => original(redactSecrets(format(...args), secrets));
    restores.push(() => {
      console[method] = original;
    });
  }

  const onFatal = (error: unknown): void => {
    console.error(redactSecrets(sanitizeForLog(error), secrets));
    process.exit(1);
  };
  process.on('uncaughtException', onFatal);
  process.on('unhandledRejection', onFatal);
  restores.push(() => {
    process.off('uncaughtException', onFatal);
    process.off('unhandledRejection', onFatal);
  });

  return () => restores.forEach((restore) => restore());
}

export function resolveRpcUrl(explicit: string | undefined, compassChain: string): string {
  if (explicit) {
    return explicit;
  }

  const base = coerceString(process.env.RPC_PROXY_BASE_URL);
  const token = coerceString(process.env.RPC_PROXY_TOKEN);
  const chains = (process.env.RPC_PROXY_CHAINS ?? '').split(',').map((chain) => chain.trim());

  if (base && token && chains.includes(compassChain)) {
    return `${base.replace(/\/+$/, '')}/api/rpc/${compassChain}?_rpc_token=${token}`;
  }

  throw new Error(
    `--rpc is required: no RPC_PROXY_* variables in .env cover --compass-chain "${compassChain}", ` +
      'so the keyed proxy URL cannot be built. Pass --rpc <url> explicitly.',
  );
}

export function validateContractName(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error('Contract name must be a valid Solidity identifier (letters, digits, underscores).');
  }

  return name;
}

export function validateAddress(value: string, flag: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${flag} must be a 0x-prefixed 20-byte address.`);
  }

  return value;
}

function assertNumbersSurviveJsonParse(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNumbersSurviveJsonParse(entry, `${path}[${index}]`));
    return;
  }

  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertNumbersSurviveJsonParse(entry, `${path}.${key}`);
    }

    return;
  }

  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(
      `Constructor arg ${path} (${value}) is not an exact integer. JSON numbers above ` +
        `Number.MAX_SAFE_INTEGER are rounded on parse — 1000000000000000000000000 becomes ` +
        `999999999999999983222784, and nothing downstream can tell — and Solidity has no fractional types. ` +
        `Pass large integers as a decimal string instead, e.g. "1000000000000000000000000", which encodes exactly.`,
    );
  }
}

export function parseConstructorArgs(raw: string | undefined): unknown[] {
  if (!raw) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Constructor args must be a JSON array: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Constructor args must be a JSON array.');
  }

  assertNumbersSurviveJsonParse(parsed, 'args');

  return parsed;
}

export function parseMode(value: string): DeployMode {
  if (value === 'fork' || value === 'live' || value === 'fork-then-live' || value === 'verify') {
    return value;
  }

  throw new Error(`Invalid --mode "${value}". Expected fork | live | fork-then-live | verify.`);
}

export function parseSignerKind(value: string): SignerKind {
  if (value === 'dcw' || value === 'private-key') {
    return value;
  }

  throw new Error(`Invalid --signer "${value}". Expected dcw | private-key.`);
}

export function parseGasToken(value: string): 'usdc' | 'native' {
  if (value === 'usdc' || value === 'native') {
    return value;
  }

  throw new Error(`Invalid --gas-token "${value}". Expected usdc | native.`);
}

export function randomDeployerKey(): Hex {
  return `0x${crypto.randomBytes(32).toString('hex')}`;
}

export function deriveSalt(name: string, deployer: string): Hex {
  const hash = crypto.createHash('sha256').update(`origin:${deployer.toLowerCase()}:${name}`).digest('hex');
  return `0x${hash}`;
}

interface AbiConstructorInput {
  name?: string;
  type: string;
}

function abiConstructorInputs(abi: unknown[]): AbiConstructorInput[] | undefined {
  const ctor = abi.find((entry) => isRecord(entry) && entry.type === 'constructor');

  if (!isRecord(ctor)) {
    return undefined;
  }

  return Array.isArray(ctor.inputs) ? (ctor.inputs as AbiConstructorInput[]) : [];
}

function formatConstructorSignature(inputs: AbiConstructorInput[]): string {
  return `constructor(${inputs.map((i) => `${i.type}${i.name ? ` ${i.name}` : ''}`).join(', ')})`;
}

export const DEPLOYER_PLACEHOLDER = '$DEPLOYER';

export function assertConstructorArgs(
  artifact: CompiledArtifact,
  constructorArgs: unknown[],
  contractName: string,
): void {
  const inputs = abiConstructorInputs(artifact.abi);

  if (inputs === undefined) {
    if (constructorArgs.length > 0) {
      throw new Error(
        `${contractName} has no constructor in its ABI, but ${constructorArgs.length} constructor arg(s) were provided.`,
      );
    }

    return;
  }

  if (inputs.length === constructorArgs.length) {
    return;
  }

  const ownerHint = inputs.some((i) => i.type === 'address' && /owner|admin|authority/i.test(i.name ?? ''))
    ? ` The address parameter is likely the owner — pass the deployer wallet address, or ${DEPLOYER_PLACEHOLDER} to have it substituted automatically.`
    : '';

  throw new Error(
    `${contractName} expects ${inputs.length} constructor arg(s) but got ${constructorArgs.length}. ` +
      `viem does not validate this, so an omitted arg would revert on-chain after gas is spent. ` +
      `Required: ${formatConstructorSignature(inputs)}. Pass them as a JSON array, ` +
      `e.g. bun run compass:deploy ${contractName} '[...]'.${ownerHint}`,
  );
}

export function containsDeployerPlaceholder(value: unknown): boolean {
  if (value === DEPLOYER_PLACEHOLDER) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(containsDeployerPlaceholder);
  }

  if (isRecord(value)) {
    return Object.values(value).some(containsDeployerPlaceholder);
  }

  return false;
}

export function substituteDeployerPlaceholder(constructorArgs: unknown[], deployerAddress: string): unknown[] {
  return constructorArgs.map((arg) => (arg === DEPLOYER_PLACEHOLDER ? deployerAddress : arg));
}

export function buildInitcode(artifact: CompiledArtifact, constructorArgs: unknown[]): Hex {
  const abi = artifact.abi as Abi;

  return constructorArgs.length > 0
    ? encodeDeployData({ abi, bytecode: artifact.bytecode, args: constructorArgs })
    : encodeDeployData({ abi, bytecode: artifact.bytecode });
}

export function predictCreate2Address(factory: Hex, salt: Hex, initcode: Hex): Hex {
  return getCreate2Address({ from: factory, salt, bytecode: initcode });
}

export function isTransientRpcError(message: string): boolean {
  if (/revert|already deployed|insufficient funds|invalid opcode|out of gas/i.test(message)) {
    return false;
  }

  return /request limit reached|rate.?limit|\b429\b|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed|socket hang up|\b50[23]\b|EVM adapter error|RPC[ _]?(Request failed|Error|ERROR)|network/i.test(
    message,
  );
}

export interface VerifyReceipt {
  contractName: string;
  chain: string;
  blockchain: string;
  fingerprint: string;
  verifiedAt: string;
  forkBinary?: string;
  forkCapable?: boolean;
  fault?: string;
}

export const VERIFY_RECEIPT_MAX_AGE_MS = 2 * 60 * 60_000;

export function verifyReceiptPath(contractsRootDir: string, contractName: string): string {
  return `${contractsRootDir}/.compass-verify/${contractName}.json`;
}

export function computeVerifyFingerprint(artifact: CompiledArtifact, declaredConstructorArgs: unknown[]): string {
  const payload = `${artifact.bytecode}|${JSON.stringify(declaredConstructorArgs)}`;
  return `0x${crypto.createHash('sha256').update(payload).digest('hex')}`;
}

export function buildVerifyReceipt(input: {
  contractName: string;
  chain: string;
  blockchain: string;
  fingerprint: string;
  verifiedAt: string;
  forkBinary: string;
  forkCapable: boolean;
  fault?: VerifyFaultKind;
}): VerifyReceipt {
  return {
    contractName: input.contractName,
    chain: input.chain,
    blockchain: input.blockchain,
    fingerprint: input.fingerprint,
    verifiedAt: input.verifiedAt,
    forkBinary: input.forkBinary,
    forkCapable: input.forkCapable,
    ...(input.fault ? { fault: input.fault } : {}),
  };
}

export function parseVerifyReceipt(raw: string): VerifyReceipt | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) {
    return undefined;
  }

  const { contractName, chain, blockchain, fingerprint, verifiedAt } = parsed;

  if (
    typeof contractName !== 'string' ||
    typeof chain !== 'string' ||
    typeof blockchain !== 'string' ||
    typeof fingerprint !== 'string' ||
    typeof verifiedAt !== 'string'
  ) {
    return undefined;
  }

  return {
    contractName,
    chain,
    blockchain,
    fingerprint,
    verifiedAt,
    ...(typeof parsed.forkBinary === 'string' ? { forkBinary: parsed.forkBinary } : {}),
    ...(typeof parsed.forkCapable === 'boolean' ? { forkCapable: parsed.forkCapable } : {}),
    ...(parsed.fault === undefined ? {} : { fault: typeof parsed.fault === 'string' ? parsed.fault : 'unknown' }),
  };
}

export function assertVerifyReceiptCovers(
  receipt: VerifyReceipt | undefined,
  expected: {
    contractName: string;
    chain: string;
    blockchain: string;
    fingerprint: string;
    requiresForkTooling: boolean;
  },
  nowMs: number = Date.now(),
): void {
  const rerun =
    `Run the fork-verify gate first:\n` +
    `  bun run compass:deploy ${expected.contractName} [ctorArgsJson] --mode verify <chain flags>\n` +
    `then re-run this live deploy. To deploy without verifying, pass --skip-verify "<reason>".`;

  if (!receipt) {
    throw new Error(`Refusing --mode live: no fork-verify receipt found for ${expected.contractName}.\n${rerun}`);
  }

  if (receipt.contractName !== expected.contractName) {
    throw new Error(
      `Refusing --mode live: the fork-verify receipt is for ${receipt.contractName}, not ${expected.contractName}.\n${rerun}`,
    );
  }

  if (receipt.chain !== expected.chain) {
    throw new Error(
      `Refusing --mode live: ${expected.contractName} was fork-verified on ${receipt.chain}, not ${expected.chain}.\n${rerun}`,
    );
  }

  if (receipt.blockchain !== expected.blockchain) {
    throw new Error(
      `Refusing --mode live: ${expected.contractName} was fork-verified with --blockchain ${receipt.blockchain}, ` +
        `not ${expected.blockchain}. The gas is spent on the --blockchain chain while every read goes to ` +
        `--compass-chain, so a mismatched pair broadcasts to one chain and confirms against another.\n${rerun}`,
    );
  }

  if (expected.requiresForkTooling && receipt.forkCapable !== true) {
    const ran = receipt.forkBinary === undefined ? 'a deploy script that does not record its fork binary' : receipt.forkBinary;
    throw new Error(
      `Refusing --mode live: ${expected.contractName} was fork-verified on ${ran}, not on ${expected.chain}'s own ` +
        "fork binary, so the fork lacked the chain's native-coin precompiles and its tests prove nothing about this " +
        `chain.\n${rerun}`,
    );
  }

  if (receipt.fault !== undefined) {
    throw new Error(
      `Refusing --mode live: ${expected.contractName}'s fork-verify receipt comes from an eval run that broke the ` +
        `fork on purpose (${receipt.fault}), so it verifies nothing.\n${rerun}`,
    );
  }

  if (receipt.fingerprint.toLowerCase() !== expected.fingerprint.toLowerCase()) {
    throw new Error(
      `Refusing --mode live: ${expected.contractName}'s compiled bytecode or constructor args changed since it was ` +
        `fork-verified — the fork run no longer describes what you are about to deploy.\n${rerun}`,
    );
  }

  const verifiedAtMs = Date.parse(receipt.verifiedAt);

  if (!Number.isFinite(verifiedAtMs) || nowMs - verifiedAtMs > VERIFY_RECEIPT_MAX_AGE_MS) {
    throw new Error(
      `Refusing --mode live: ${expected.contractName}'s fork-verify receipt is stale (verifiedAt ` +
        `${receipt.verifiedAt}). Foundry bytecode is deterministic, so a receipt from an earlier — possibly ` +
        `abandoned — session would otherwise satisfy this gate forever; it is only accepted for ` +
        `${VERIFY_RECEIPT_MAX_AGE_MS / 60_000} minutes.\n${rerun}`,
    );
  }
}

export function getForkRpcUrl(run: Record<string, unknown>, chain: string): string {
  const forks = run.forks;

  if (!(forks instanceof Map)) {
    throw new Error('Dry-run result has no forks map — cannot locate the fork RPC URL.');
  }

  const fork = forks.get(chain) as { rpcUrl?: unknown } | undefined;

  if (!fork || typeof fork.rpcUrl !== 'string') {
    throw new Error(`No fork instance found for chain ${chain} after dry-run.`);
  }

  return fork.rpcUrl;
}

export interface ResolvedForkBinary {
  command: string;
  capable: boolean;
}

export type ForkBinaryChoice =
  | { kind: 'stock' }
  | { kind: 'custom'; command: string }
  | { kind: 'degraded'; reason: string };

export function chooseForkBinary(
  forkTooling: unknown,
  resolveForkBinary: ((forkTooling: unknown) => ResolvedForkBinary) | undefined,
): ForkBinaryChoice {
  if (!isRecord(forkTooling)) {
    return { kind: 'stock' };
  }

  const reason = coerceString(forkTooling.reason) ?? 'This chain needs a custom fork binary.';

  if (!resolveForkBinary) {
    return { kind: 'degraded', reason: `${reason} This Compass build does not export resolveForkBinary.` };
  }

  let resolved: ResolvedForkBinary;
  try {
    resolved = resolveForkBinary(forkTooling);
  } catch (error) {
    return { kind: 'degraded', reason: `${reason} ${sanitizeForLog(error)}` };
  }

  if (!resolved.capable) {
    return { kind: 'degraded', reason };
  }

  // A bare `anvil` here would make the PATH shim exec itself.
  return resolved.command === 'anvil'
    ? { kind: 'degraded', reason: `${reason} The fork binary override points at stock anvil.` }
    : { kind: 'custom', command: resolved.command };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function forkBinaryShimScript(command: string, markerPath: string): string {
  return `#!/bin/sh\n: > ${shellQuote(markerPath)}\nexec ${shellQuote(command)} "$@"\n`;
}

/**
 * Puts an `anvil` shim that execs `command` first on `env.PATH`. The returned function restores `PATH`, removes the
 * shim, and returns whether anything ran it.
 */
export function installForkBinaryShim(
  command: string,
  env: Record<string, string | undefined>,
  tmpdir: string,
): () => boolean {
  const originalPath = env.PATH;
  const shimDir = fs.mkdtempSync(path.join(tmpdir, 'compass-fork-bin-'));
  const markerPath = path.join(shimDir, 'used');
  fs.writeFileSync(path.join(shimDir, 'anvil'), forkBinaryShimScript(command, markerPath), { mode: 0o755 });
  env.PATH = `${shimDir}${path.delimiter}${originalPath ?? ''}`;

  return () => {
    const used = fs.existsSync(markerPath);
    if (originalPath === undefined) {
      delete env.PATH;
    } else {
      env.PATH = originalPath;
    }
    fs.rmSync(shimDir, { recursive: true, force: true });
    return used;
  };
}

// The degraded branches below are unreachable while compass-deploy.ts stops on a degraded fork with
// ForkInfrastructureError; they are the wording for the degrade-and-disclose alternative, kept so that switch stays small.
const DEGRADED_FORK_REVERT =
  "This fork runs stock anvil, which lacks this chain's native-coin precompiles, so the revert may come from the " +
  'fork rather than the contract.';

export function rehearsalFailureCause(detail: string, degradedFork: boolean): string {
  if (!/revert/i.test(detail)) {
    return 'The fork rehearsal itself failed.';
  }

  return degradedFork
    ? `The constructor reverted. ${DEGRADED_FORK_REVERT}`
    : 'The constructor reverted with these args on the fork — treat it as a contract bug, not a retry.';
}

export function verifyDeployRevertMessage(contractName: string, txHash: string, degradedFork: boolean): string {
  const head = `Fork verify: Create2Factory.deploy(${contractName}) REVERTED on the fork (tx ${txHash}).`;

  return degradedFork
    ? `${head} ${DEGRADED_FORK_REVERT} Treat it as a fork-infrastructure failure, not a contract bug, and do not ` +
        'change the source because of it.'
    : `${head} This IS a contract failure — the constructor reverted with these args. Treat it as a suspected ` +
        'contract bug and fix the source or the constructor args; do NOT reroute to another deploy engine, ' +
        'which would broadcast the same reverting init code with real gas.';
}

/**
 * `--skip-verify` waives a passing verify, never the binding: a current receipt
 * for this contract on this chain must still match the bytes being deployed.
 * Receipts for another chain, or older than `VERIFY_RECEIPT_MAX_AGE_MS`, bind nothing.
 */
export function assertSkipVerifyStillMatches(
  receipt: VerifyReceipt | undefined,
  expected: { contractName: string; chain: string; fingerprint: string },
  nowMs: number = Date.now(),
): void {
  const { contractName, chain, fingerprint } = expected;
  const current =
    receipt !== undefined &&
    receipt.contractName === contractName &&
    receipt.chain === chain &&
    nowMs - Date.parse(receipt.verifiedAt) <= VERIFY_RECEIPT_MAX_AGE_MS;

  if (current && receipt.fingerprint.toLowerCase() !== fingerprint.toLowerCase()) {
    throw new Error(
      `Refusing --mode live --skip-verify: the fork-verify receipt for ${contractName} was written for different ` +
        'bytecode or constructor args than this deploy, so the contract or its args changed after --mode verify ' +
        'ran. Re-run --mode verify on the current contract, then deploy.',
    );
  }
}

export class ForkInfrastructureError extends Error {
  constructor(chain: string) {
    super(
      `FORK-INFRASTRUCTURE: the ${chain} fork would run on stock anvil, which lacks this chain's native-coin ` +
        'precompiles, so nothing tested on it would hold on the chain. Nothing was deployed or broadcast and no ' +
        'fork-verify receipt was written. This is not a contract failure; do not change the source.',
    );
    this.name = 'ForkInfrastructureError';
  }
}

export async function awaitForkDryRun<T, F extends { degraded: boolean }>(
  dryRun: Promise<T>,
  settle: () => F,
  chain: string,
): Promise<{ run: T; fork: F }> {
  try {
    const run = await dryRun;
    return { run, fork: settle() };
  } catch (error) {
    if (settle().degraded) {
      throw new ForkInfrastructureError(chain);
    }
    throw error;
  }
}

export type VerifyFaultKind = 'usdc-code-revert';

export interface VerifyFault {
  fault: VerifyFaultKind;
  address: Hex;
}

export const REVERT_ALL_BYTECODE: Hex = '0x60006000fd';

function isVerifyFaultKind(value: unknown): value is VerifyFaultKind {
  return value === 'usdc-code-revert';
}

export function verifyFaultPath(contractsRootDir: string): string {
  return `${contractsRootDir}/.compass-verify/fault.json`;
}

export function parseVerifyFault(raw: string): VerifyFault | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed) || !isVerifyFaultKind(parsed.fault) || typeof parsed.address !== 'string') {
    return undefined;
  }

  return /^0x[0-9a-fA-F]{40}$/.test(parsed.address)
    ? { fault: parsed.fault, address: parsed.address as Hex }
    : undefined;
}
