// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {SocialGraph} from "../src/SocialGraph.sol";

contract SocialGraphTest is BaseTest {
    function test_followAndUnfollow_byOwner() public {
        vm.expectEmit(true, true, false, false);
        emit SocialGraph.Followed(bob, carol);
        vm.prank(bob);
        graph.follow(bob, carol);
        assertTrue(graph.isFollowing(bob, carol));

        vm.prank(bob);
        graph.unfollow(bob, carol);
        assertFalse(graph.isFollowing(bob, carol));
    }

    function test_follow_bySessionKey() public {
        _onboardAlice();
        vm.prank(aliceKey);
        graph.follow(alice, bob);
        assertTrue(graph.isFollowing(alice, bob));
    }

    function test_follow_unregisteredTarget_allowed() public {
        address stranger = makeAddr("notYetOnApp");
        vm.prank(bob);
        graph.follow(bob, stranger);
        assertTrue(graph.isFollowing(bob, stranger));
    }

    function test_follow_isIdempotent_noDuplicateEvent() public {
        vm.startPrank(bob);
        graph.follow(bob, carol);
        vm.recordLogs();
        graph.follow(bob, carol);
        assertEq(vm.getRecordedLogs().length, 0);
        vm.stopPrank();
    }

    function test_follow_unauthorized_reverts() public {
        vm.prank(carol);
        vm.expectRevert(SocialGraph.NotAuthorized.selector);
        graph.follow(bob, carol);
    }

    function test_follow_expiredKey_reverts() public {
        _onboardAlice();
        vm.warp(block.timestamp + 31 days);
        vm.prank(aliceKey);
        vm.expectRevert(SocialGraph.NotAuthorized.selector);
        graph.follow(alice, bob);
    }

    function test_follow_revokedKey_reverts() public {
        _onboardAlice();
        vm.prank(alice);
        identity.removeDelegate(aliceKey);
        vm.prank(aliceKey);
        vm.expectRevert(SocialGraph.NotAuthorized.selector);
        graph.follow(alice, bob);
    }

    function test_follow_selfOrZero_reverts() public {
        vm.startPrank(bob);
        vm.expectRevert(SocialGraph.InvalidTarget.selector);
        graph.follow(bob, bob);
        vm.expectRevert(SocialGraph.InvalidTarget.selector);
        graph.follow(bob, address(0));
        vm.stopPrank();
    }

    function test_followMany() public {
        address[] memory targets = new address[](50);
        for (uint256 i; i < targets.length; ++i) {
            targets[i] = address(uint160(0x1000 + i));
        }
        vm.prank(bob);
        graph.followMany(bob, targets);
        for (uint256 i; i < targets.length; ++i) {
            assertTrue(graph.isFollowing(bob, targets[i]));
        }
    }

    function test_followMany_tooLarge_reverts() public {
        address[] memory targets = new address[](51);
        for (uint256 i; i < targets.length; ++i) {
            targets[i] = address(uint160(0x1000 + i));
        }
        vm.prank(bob);
        vm.expectRevert(SocialGraph.BatchTooLarge.selector);
        graph.followMany(bob, targets);
    }

    function testFuzz_onlyAuthorizedCanFollow(address caller, address actor, address target) public {
        vm.assume(caller != actor && target != actor && target != address(0));
        vm.prank(caller);
        vm.expectRevert(SocialGraph.NotAuthorized.selector);
        graph.follow(actor, target);
    }

    function testFuzz_followManyIdempotent(uint8 n) public {
        n = uint8(bound(n, 1, 50));
        address[] memory targets = new address[](n);
        for (uint256 i; i < n; ++i) {
            targets[i] = address(uint160(0x2000 + (i % 7)));
        }
        vm.prank(bob);
        graph.followMany(bob, targets);
        for (uint256 i; i < n; ++i) {
            assertTrue(graph.isFollowing(bob, targets[i]));
        }
    }
}
