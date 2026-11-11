// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {SocialGraph} from "../src/SocialGraph.sol";
import {Posts} from "../src/Posts.sol";
import {TestUSD} from "../src/TestUSD.sol";
import {PlanPayments} from "../src/PlanPayments.sol";

/// Deploy toàn bộ contract và ghi địa chỉ vào packages/protocol/deployments/<chainId>.json
/// Local:  forge script script/Deploy.s.sol --rpc-url anvil --broadcast --private-key <anvil key>
/// Fuji:   forge script script/Deploy.s.sol --rpc-url fuji --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract Deploy is Script {
    uint8 internal constant PRO = 1;
    uint256 internal constant PRO_PRICE = 5e6; // 5 tUSD / tháng

    function run() external {
        uint256 startBlock = block.number;
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);

        IdentityRegistry identity = new IdentityRegistry();
        SocialGraph graph = new SocialGraph(identity);
        Posts posts = new Posts(identity);
        TestUSD tusd = new TestUSD(deployer);
        PlanPayments payments = new PlanPayments(tusd, treasury, deployer);
        payments.setPlan(PRO, PRO_PRICE);
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "startBlock", startBlock);
        vm.serializeString(key, "version", "v1");
        vm.serializeAddress(key, "IdentityRegistry", address(identity));
        vm.serializeAddress(key, "SocialGraph", address(graph));
        vm.serializeAddress(key, "Posts", address(posts));
        vm.serializeAddress(key, "TestUSD", address(tusd));
        vm.serializeAddress(key, "PlanPayments", address(payments));
        string memory json = vm.serializeAddress(key, "treasury", treasury);

        string memory path = string.concat("../packages/protocol/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Deployment written to", path);
    }
}
