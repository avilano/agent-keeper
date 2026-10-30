import { Page, Locator, expect } from '@playwright/test';

export class ToolshopPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly searchSubmitBtn: Locator;
  readonly searchResetBtn: Locator;
  readonly sortSelect: Locator;
  readonly catalogProductCards: Locator;
  readonly catalogProductNames: Locator;
  readonly addToCartBtn: Locator;
  readonly navCartBtn: Locator;
  readonly cartQtyBadge: Locator;
  readonly proceedStep1Btn: Locator;
  readonly proceedStep2Btn: Locator;
  readonly proceedStep3Btn: Locator;
  readonly paymentMethodSelect: Locator;
  readonly finishPaymentBtn: Locator;
  readonly paymentSuccessBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.getByTestId('search-query');
    this.searchSubmitBtn = page.getByTestId('search-submit');
    this.searchResetBtn = page.getByTestId('search-reset');
    this.sortSelect = page.getByTestId('sort');
    this.catalogProductCards = page.locator('#product-grid .card');
    this.catalogProductNames = page.locator('#product-grid').getByTestId('product-name');
    this.addToCartBtn = page.getByTestId('add-to-cart');
    this.navCartBtn = page.getByTestId('nav-cart');
    this.cartQtyBadge = page.getByTestId('cart-quantity');
    this.proceedStep1Btn = page.getByTestId('proceed-1');
    this.proceedStep2Btn = page.getByTestId('proceed-2');
    this.proceedStep3Btn = page.getByTestId('proceed-3');
    this.paymentMethodSelect = page.getByTestId('payment-method');
    this.finishPaymentBtn = page.getByTestId('finish');
    this.paymentSuccessBanner = page.getByTestId('payment-success-message');
  }

  async gotoCatalog() {
    await this.page.goto('/');
    await expect(this.page.getByTestId('product-name').first()).toBeVisible();
  }

  async searchForProduct(query: string) {
    await this.searchInput.fill(query);
    await this.searchSubmitBtn.click();
  }

  async openProductByName(name: string) {
    await this.page.getByTestId('product-name').filter({ hasText: name }).first().click();
    await expect(this.addToCartBtn).toBeVisible();
  }

  async addCurrentProductToCart(quantity = 1) {
    if (quantity > 1) {
      await this.page.getByTestId('quantity').fill(String(quantity));
    }
    await this.addToCartBtn.click();
  }

  async completeCheckoutWithBankTransfer() {
    await this.navCartBtn.click();
    await this.proceedStep1Btn.click();
    await this.proceedStep2Btn.click();

    await this.page.getByTestId('address').fill('Test Street 98');
    await this.page.getByTestId('city').fill('Vienna');
    await this.page.getByTestId('state').fill('Vienna');
    await this.page.getByTestId('country').fill('AT');
    await this.page.getByTestId('postcode').fill('1010');
    await this.proceedStep3Btn.click();

    await this.paymentMethodSelect.selectOption('bank-transfer');
    await this.page.getByTestId('bank_name').fill('Circle Creator Bank');
    await this.page.getByTestId('account_name').fill('Jane Doe');
    await this.page.getByTestId('account_number').fill('9876543210');
    await this.finishPaymentBtn.click();
  }
}
