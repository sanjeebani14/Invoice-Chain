import { getBackendOrigin } from "./backendOrigin";

export const API_BASE = getBackendOrigin(); // Unified!
export const RPC_PROVIDER = process.env.NEXT_PUBLIC_RPC_PROVIDER || "https://sepolia.base.org";
export const EXPECTED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID || "84532");