const hre = require("hardhat");

async function main() {
  const SecureRegistry = await hre.ethers.getContractFactory("SecureRegistry");
  const registry = await SecureRegistry.deploy();
  await registry.waitForDeployment();

  console.log("SecureRegistry deployed to:", await registry.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
