// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {Posts} from "../src/Posts.sol";

contract PostsTest is BaseTest {
    bytes32 internal constant CH_AVAX = keccak256("avalanche");

    function test_post_bySessionKey() public {
        _onboardAlice();
        bytes32 expectedId = keccak256(abi.encode(alice, uint256(0)));
        vm.expectEmit(true, true, true, true);
        emit Posts.Posted(expectedId, alice, bytes32(0), CH_AVAX, "gm builders", "", uint64(block.timestamp));
        vm.prank(aliceKey);
        bytes32 id = posts.post(alice, "gm builders", bytes32(0), CH_AVAX, "");
        assertEq(id, expectedId);
        assertEq(posts.authorOf(id), alice);
        assertEq(posts.postNonce(alice), 1);
    }

    function test_reply() public {
        vm.prank(bob);
        bytes32 root = posts.post(bob, "root", bytes32(0), bytes32(0), "");
        vm.prank(carol);
        bytes32 reply = posts.post(carol, "reply", root, bytes32(0), "");
        assertEq(posts.authorOf(reply), carol);
    }

    function test_reply_toUnknownPost_reverts() public {
        vm.prank(bob);
        vm.expectRevert(Posts.UnknownPost.selector);
        posts.post(bob, "reply", keccak256("nope"), bytes32(0), "");
    }

    function test_vietnameseTextCountsBytes() public {
        // "ư" = 2 byte, "ộ" = 3 byte trong UTF-8
        string memory vi = unicode"Bớt tin chính trị đi, ưu tiên founder viết có nội dung";
        assertGt(bytes(vi).length, 54);
        vm.prank(bob);
        posts.post(bob, vi, bytes32(0), bytes32(0), "");
    }

    function test_post_emptyOrTooLong_reverts() public {
        vm.startPrank(bob);
        vm.expectRevert(Posts.EmptyText.selector);
        posts.post(bob, "", bytes32(0), bytes32(0), "");
        vm.expectRevert(Posts.TextTooLong.selector);
        posts.post(bob, string(new bytes(1025)), bytes32(0), bytes32(0), "");
        vm.expectRevert(Posts.MetaTooLong.selector);
        posts.post(bob, "ok", bytes32(0), bytes32(0), new bytes(1025));
        vm.stopPrank();
    }

    function test_post_maxLength_ok() public {
        vm.prank(bob);
        posts.post(bob, string(new bytes(1024)), bytes32(0), bytes32(0), new bytes(1024));
    }

    function test_post_unauthorized_reverts() public {
        _onboardAlice();
        vm.prank(bob);
        vm.expectRevert(Posts.NotAuthorized.selector);
        posts.post(alice, "impersonation", bytes32(0), bytes32(0), "");
    }

    function test_post_afterRevoke_reverts() public {
        _onboardAlice();
        vm.prank(alice);
        identity.removeDelegate(aliceKey);
        vm.prank(aliceKey);
        vm.expectRevert(Posts.NotAuthorized.selector);
        posts.post(alice, "should fail", bytes32(0), bytes32(0), "");
    }

    function test_reactAndUnreact() public {
        vm.prank(bob);
        bytes32 id = posts.post(bob, "hello", bytes32(0), bytes32(0), "");
        vm.expectEmit(true, true, false, true);
        emit Posts.Reacted(carol, id, 1);
        vm.prank(carol);
        posts.react(carol, id, 1);
        vm.prank(carol);
        posts.unreact(carol, id, 1);
    }

    function test_react_invalid_reverts() public {
        vm.prank(bob);
        bytes32 id = posts.post(bob, "hello", bytes32(0), bytes32(0), "");
        vm.startPrank(carol);
        vm.expectRevert(Posts.InvalidKind.selector);
        posts.react(carol, id, 3);
        vm.expectRevert(Posts.UnknownPost.selector);
        posts.react(carol, keccak256("x"), 1);
        vm.stopPrank();
    }

    function test_delete_onlyAuthor() public {
        vm.prank(bob);
        bytes32 id = posts.post(bob, "hello", bytes32(0), bytes32(0), "");

        vm.prank(carol);
        vm.expectRevert(Posts.NotAuthor.selector);
        posts.deletePost(carol, id);

        vm.expectEmit(true, true, false, false);
        emit Posts.Deleted(bob, id);
        vm.prank(bob);
        posts.deletePost(bob, id);
    }

    function test_delete_bySessionKey() public {
        _onboardAlice();
        vm.prank(aliceKey);
        bytes32 id = posts.post(alice, "oops", bytes32(0), bytes32(0), "");
        vm.prank(aliceKey);
        posts.deletePost(alice, id);
    }

    function testFuzz_postIdsUnique(uint8 n) public {
        n = uint8(bound(n, 2, 30));
        bytes32 prev;
        for (uint256 i; i < n; ++i) {
            vm.prank(bob);
            bytes32 id = posts.post(bob, "x", bytes32(0), bytes32(0), "");
            assertTrue(id != prev);
            assertEq(posts.authorOf(id), bob);
            prev = id;
        }
    }

    function testFuzz_textLength(uint16 len) public {
        len = uint16(bound(len, 0, 2048));
        vm.prank(bob);
        if (len == 0) {
            vm.expectRevert(Posts.EmptyText.selector);
        } else if (len > 1024) {
            vm.expectRevert(Posts.TextTooLong.selector);
        }
        posts.post(bob, string(new bytes(len)), bytes32(0), bytes32(0), "");
    }

    function testFuzz_onlyAuthorizedCanPost(address caller, address actor) public {
        vm.assume(caller != actor);
        vm.prank(caller);
        vm.expectRevert(Posts.NotAuthorized.selector);
        posts.post(actor, "x", bytes32(0), bytes32(0), "");
    }
}
