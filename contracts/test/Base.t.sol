// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {SocialGraph} from "../src/SocialGraph.sol";
import {Posts} from "../src/Posts.sol";

abstract contract BaseTest is Test {
    IdentityRegistry internal identity;
    SocialGraph internal graph;
    Posts internal posts;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal aliceKey = makeAddr("aliceSessionKey");

    function setUp() public virtual {
        vm.warp(1_750_000_000);
        identity = new IdentityRegistry();
        graph = new SocialGraph(identity);
        posts = new Posts(identity);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    /// alice đăng ký + cấp session key 30 ngày
    function _onboardAlice() internal {
        vm.prank(alice);
        identity.registerWithDelegate{value: 0.05 ether}(
            "alice", "https://example.test/p/alice.json", aliceKey, uint64(block.timestamp + 30 days)
        );
    }
}
