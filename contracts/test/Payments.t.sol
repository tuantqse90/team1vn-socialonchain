// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TestUSD} from "../src/TestUSD.sol";
import {PlanPayments} from "../src/PlanPayments.sol";

contract PaymentsTest is Test {
    TestUSD internal tusd;
    PlanPayments internal payments;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    uint256 internal userPk = 0xA11CE;
    address internal user;

    uint8 internal constant PRO = 1;
    uint256 internal constant PRO_PRICE = 5e6;

    function setUp() public {
        vm.warp(1_750_000_000);
        user = vm.addr(userPk);
        tusd = new TestUSD(owner);
        payments = new PlanPayments(tusd, treasury, owner);
        vm.prank(owner);
        payments.setPlan(PRO, PRO_PRICE);
    }

    // ---------- TestUSD ----------

    function test_tusd_metadata() public view {
        assertEq(tusd.decimals(), 6);
        assertEq(tusd.symbol(), "tUSD");
        assertEq(tusd.name(), "Test USD");
    }

    function test_faucet_respectsCooldown() public {
        vm.prank(user);
        tusd.faucet();
        assertEq(tusd.balanceOf(user), 10e6);

        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(TestUSD.FaucetCooldown.selector, block.timestamp + 7 days));
        tusd.faucet();

        vm.warp(block.timestamp + 7 days);
        vm.prank(user);
        tusd.faucet();
        assertEq(tusd.balanceOf(user), 20e6);
    }

    function test_mint_onlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        tusd.mint(user, 1e6);

        vm.prank(owner);
        tusd.mint(user, 1e6);
        assertEq(tusd.balanceOf(user), 1e6);
    }

    function test_configureFaucet_onlyOwner() public {
        vm.prank(owner);
        tusd.configureFaucet(1e6, 1 days);
        vm.prank(user);
        tusd.faucet();
        assertEq(tusd.balanceOf(user), 1e6);
    }

    // ---------- PlanPayments ----------

    function test_pay_withApprove() public {
        _fund(user, 100e6);
        vm.startPrank(user);
        tusd.approve(address(payments), 10e6);
        vm.expectEmit(true, true, false, true);
        emit PlanPayments.Paid(user, PRO, 10e6, uint64(block.timestamp + 60 days));
        payments.pay(PRO, 2);
        vm.stopPrank();

        assertEq(tusd.balanceOf(treasury), 10e6);
        assertEq(tusd.balanceOf(user), 90e6);
        assertEq(payments.paidUntil(user, PRO), block.timestamp + 60 days);
    }

    function test_pay_extendsWhileActive() public {
        _fund(user, 100e6);
        vm.startPrank(user);
        tusd.approve(address(payments), type(uint256).max);
        payments.pay(PRO, 1);
        vm.warp(block.timestamp + 10 days);
        payments.pay(PRO, 1);
        vm.stopPrank();
        // còn 20 ngày + 30 ngày mới
        assertEq(payments.paidUntil(user, PRO), block.timestamp + 50 days);
    }

    function test_pay_afterExpiryStartsFromNow() public {
        _fund(user, 100e6);
        vm.startPrank(user);
        tusd.approve(address(payments), type(uint256).max);
        payments.pay(PRO, 1);
        vm.warp(block.timestamp + 45 days);
        payments.pay(PRO, 1);
        vm.stopPrank();
        assertEq(payments.paidUntil(user, PRO), block.timestamp + 30 days);
    }

    function test_payWithPermit_singleTx() public {
        _fund(user, 100e6);
        uint256 amount = PRO_PRICE * 3;
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(userPk, address(payments), amount, deadline);

        vm.prank(user);
        payments.payWithPermit(PRO, 3, deadline, v, r, s);
        assertEq(tusd.balanceOf(treasury), amount);
        assertEq(payments.paidUntil(user, PRO), block.timestamp + 90 days);
    }

    function test_payWithPermit_frontRunPermitStillPays() public {
        _fund(user, 100e6);
        uint256 amount = PRO_PRICE;
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(userPk, address(payments), amount, deadline);
        // kẻ khác dùng permit trước
        tusd.permit(user, address(payments), amount, deadline, v, r, s);
        vm.prank(user);
        payments.payWithPermit(PRO, 1, deadline, v, r, s);
        assertEq(tusd.balanceOf(treasury), amount);
    }

    function test_pay_unknownPlanOrMonths_reverts() public {
        vm.startPrank(user);
        vm.expectRevert(PlanPayments.UnknownPlan.selector);
        payments.pay(9, 1);
        vm.expectRevert(PlanPayments.InvalidMonths.selector);
        payments.pay(PRO, 0);
        vm.expectRevert(PlanPayments.InvalidMonths.selector);
        payments.pay(PRO, 13);
        vm.stopPrank();
    }

    function test_pay_insufficientAllowance_reverts() public {
        _fund(user, 100e6);
        vm.prank(user);
        vm.expectRevert();
        payments.pay(PRO, 1);
        assertEq(payments.paidUntil(user, PRO), 0);
    }

    function test_adminFunctions_onlyOwner() public {
        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        payments.setPlan(PRO, 0);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        payments.setTreasury(user);
        vm.stopPrank();
    }

    function testFuzz_payAmountMatchesQuote(uint8 months) public {
        months = uint8(bound(months, 1, 12));
        _fund(user, 1000e6);
        vm.startPrank(user);
        tusd.approve(address(payments), type(uint256).max);
        payments.pay(PRO, months);
        vm.stopPrank();
        assertEq(tusd.balanceOf(treasury), PRO_PRICE * months);
        assertEq(payments.paidUntil(user, PRO), block.timestamp + uint256(months) * 30 days);
    }

    // ---------- helpers ----------

    function _fund(address to, uint256 amount) internal {
        vm.prank(owner);
        tusd.mint(to, amount);
    }

    function _signPermit(uint256 pk, address spender, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8, bytes32, bytes32)
    {
        address holder = vm.addr(pk);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                holder,
                spender,
                value,
                tusd.nonces(holder),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", tusd.DOMAIN_SEPARATOR(), structHash));
        return vm.sign(pk, digest);
    }
}
