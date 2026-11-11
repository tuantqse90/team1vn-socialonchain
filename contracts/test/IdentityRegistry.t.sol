// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";

contract IdentityRegistryTest is BaseTest {
    function test_registerWithDelegate_registersDelegatesAndFundsKey() public {
        vm.expectEmit(true, false, false, true);
        emit IdentityRegistry.Registered(alice, "alice", "https://example.test/p/alice.json");
        vm.expectEmit(true, true, false, true);
        emit IdentityRegistry.DelegateAdded(alice, aliceKey, uint64(block.timestamp + 30 days));
        _onboardAlice();

        assertTrue(identity.registered(alice));
        assertEq(identity.handleOf(alice), "alice");
        assertEq(identity.ownerOfHandle(keccak256("alice")), alice);
        assertTrue(identity.isAuthorized(alice, aliceKey));
        assertTrue(identity.isAuthorized(alice, alice));
        assertFalse(identity.isAuthorized(alice, bob));
        assertEq(aliceKey.balance, 0.05 ether, "session key phai nhan duoc gas");
        assertEq(alice.balance, 10 ether - 0.05 ether);
    }

    function test_register_withoutHandle() public {
        vm.prank(bob);
        identity.register("", "");
        assertTrue(identity.registered(bob));
        assertEq(identity.handleOf(bob), "");
    }

    function test_register_twice_reverts() public {
        vm.startPrank(bob);
        identity.register("bob", "");
        vm.expectRevert(IdentityRegistry.AlreadyRegistered.selector);
        identity.register("bob2", "");
        vm.stopPrank();
    }

    function test_handleTaken_reverts() public {
        vm.prank(bob);
        identity.register("builder", "");
        vm.prank(carol);
        vm.expectRevert(IdentityRegistry.HandleTaken.selector);
        identity.register("builder", "");
    }

    function test_invalidHandles_revert() public {
        string[6] memory bad = ["ab", "UPPER", "has space", "dash-name", "this_handle_is_way_too_long", unicode"việt"];
        for (uint256 i; i < bad.length; ++i) {
            address who = address(uint160(1000 + i));
            vm.prank(who);
            vm.expectRevert(IdentityRegistry.InvalidHandle.selector);
            identity.register(bad[i], "");
        }
    }

    function test_validHandles() public view {
        assertTrue(identity.isValidHandle(""));
        assertTrue(identity.isValidHandle("abc"));
        assertTrue(identity.isValidHandle("team1_vn"));
        assertTrue(identity.isValidHandle("a1234567890123456789"));
    }

    function test_delegateExpires() public {
        _onboardAlice();
        vm.warp(block.timestamp + 30 days);
        assertFalse(identity.isAuthorized(alice, aliceKey), "het han dung luc expiresAt");
    }

    function test_removeDelegate_revokes() public {
        _onboardAlice();
        vm.prank(alice);
        identity.removeDelegate(aliceKey);
        assertFalse(identity.isAuthorized(alice, aliceKey));
    }

    function test_removeUnknownDelegate_reverts() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.InvalidDelegate.selector);
        identity.removeDelegate(aliceKey);
    }

    function test_addDelegate_invalidExpiry_reverts() public {
        vm.startPrank(alice);
        vm.expectRevert(IdentityRegistry.InvalidExpiry.selector);
        identity.addDelegate(aliceKey, uint64(block.timestamp));
        vm.expectRevert(IdentityRegistry.InvalidExpiry.selector);
        identity.addDelegate(aliceKey, uint64(block.timestamp + 366 days));
        vm.expectRevert(IdentityRegistry.InvalidDelegate.selector);
        identity.addDelegate(alice, uint64(block.timestamp + 1 days));
        vm.stopPrank();
    }

    function test_addDelegate_topsUpGas() public {
        _onboardAlice();
        vm.prank(alice);
        identity.addDelegate{value: 0.1 ether}(aliceKey, uint64(block.timestamp + 60 days));
        assertEq(aliceKey.balance, 0.15 ether);
    }

    /// Delegate gọi addDelegate/removeDelegate/register chỉ tác động lên CHÍNH NÓ, không lên owner.
    function test_delegateCannotManageOwnersDelegates() public {
        _onboardAlice();
        address attackerKey = makeAddr("attackerKey");
        vm.prank(aliceKey);
        identity.addDelegate(attackerKey, uint64(block.timestamp + 1 days));
        assertFalse(identity.isAuthorized(alice, attackerKey), "delegate khong duoc cap key cho owner");
        assertTrue(identity.isAuthorized(aliceKey, attackerKey));

        vm.prank(aliceKey);
        vm.expectRevert(IdentityRegistry.InvalidDelegate.selector);
        identity.removeDelegate(aliceKey);
        assertTrue(identity.isAuthorized(alice, aliceKey));
    }

    function test_setProfile_byDelegate() public {
        _onboardAlice();
        vm.expectEmit(true, false, false, true);
        emit IdentityRegistry.ProfileUpdated(alice, "ipfs://new");
        vm.prank(aliceKey);
        identity.setProfile(alice, "ipfs://new");
    }

    function test_setProfile_unauthorized_reverts() public {
        _onboardAlice();
        vm.prank(bob);
        vm.expectRevert(IdentityRegistry.NotAuthorized.selector);
        identity.setProfile(alice, "ipfs://evil");
    }

    function test_uriTooLong_reverts() public {
        bytes memory long = new bytes(513);
        vm.prank(bob);
        vm.expectRevert(IdentityRegistry.UriTooLong.selector);
        identity.register("bob", string(long));
    }

    function testFuzz_randomSignerNotAuthorized(address owner, address signer) public view {
        vm.assume(owner != signer);
        assertFalse(identity.isAuthorized(owner, signer));
    }

    function testFuzz_delegateValidUntilExpiry(uint64 duration, uint64 elapsed) public {
        duration = uint64(bound(duration, 1, 365 days));
        elapsed = uint64(bound(elapsed, 0, 400 days));
        uint64 expiresAt = uint64(block.timestamp) + duration;
        vm.prank(alice);
        identity.addDelegate(aliceKey, expiresAt);
        vm.warp(block.timestamp + elapsed);
        assertEq(identity.isAuthorized(alice, aliceKey), block.timestamp < expiresAt);
    }

    function testFuzz_handleValidation(string calldata handle) public view {
        bytes memory b = bytes(handle);
        bool expected = b.length == 0 || (b.length >= 3 && b.length <= 20);
        for (uint256 i; i < b.length && expected; ++i) {
            bytes1 c = b[i];
            expected = (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "_";
        }
        assertEq(identity.isValidHandle(handle), expected);
    }
}
