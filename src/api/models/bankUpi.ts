/** Bank & UPI details – api/tally/masterdata/companyinfo */

export interface BankUpiRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
}

export interface BankItem {
  name: string;
  bankname?: string;
  accountno: string;
  ifscode?: string;
  branchname?: string;
  swiftcode?: string;
  accholdername?: string;
}

export interface UpiItem {
  name: string;
  merchantid: string;
  merchantname?: string;
}

export interface BankUpiResponse {
  banks: BankItem[];
  upis: UpiItem[];
  bankCount: number;
  upiCount: number;
  timestamp?: string;
  cached?: boolean;
}
