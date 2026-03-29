import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import * as dotenv from "dotenv";

dotenv.config();
const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViem],

  solidity: {
    profiles: {
      default: {
        version: "0.8.25",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    },
  },

  paths: {
    tests: {
      nodejs: "./test",
    },
  },

  networks: {
    baseSepolia: {
      type: "http",
      url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 84532,
    },
  },

  etherscan: {
    apiKey: {
      basescan: process.env.BASESCAN_API_KEY ?? "",
      baseSepolia: process.env.BASESCAN_API_KEY ?? "",
      "base-sepolia": process.env.BASESCAN_API_KEY ?? "",
    },
  },
};

export default config;