import { injectable, inject } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { ILogger } from '@theia/core/lib/common/logger';

export interface CoworkerSpec {
  id: string;
  name: string;
  role: string;
  category: 'Core Associates' | 'Statutory Auditors' | 'Forensic Specialists';
  version: string;
  active: boolean;
  iconClass: string;
  synced: boolean;
  description: string;
}

@injectable()
export class AgentCockpitManager {
  protected readonly onActiveCoworkersChangedEmitter = new Emitter<string[]>();
  readonly onActiveCoworkersChanged: Event<string[]> = this.onActiveCoworkersChangedEmitter.event;

  protected coworkers: CoworkerSpec[] = [
    {
      id: '@Advisor',
      name: 'Strategy & CIRP Counsel',
      role: 'Master legal strategy, CIRP timeline planning & resolution guidance',
      category: 'Core Associates',
      version: 'v3.2.0-sovereign',
      active: true,
      iconClass: 'hayagriva-advisor-icon',
      synced: true,
      description: 'Coordinates CIRP milestones, advises Resolution Professional on statutory rights, precedents & CoC agenda'
    },
    {
      id: '@Document',
      name: 'Pleadings & Agreement Drafter',
      role: 'Court applications, notices, affidavits & resolution plans',
      category: 'Core Associates',
      version: 'v3.2.0-sovereign',
      active: true,
      iconClass: 'hayagriva-document-icon',
      synced: true,
      description: 'Generates formatted Court pleadings (Order 38/39, Statement of Truth, Sec 12A mediation) in Legal Word View'
    },
    {
      id: '@Forms',
      name: 'Statutory Compliance Auditor',
      role: 'Section 29A disqualification, Section 30(2) checklist & Form H compliance',
      category: 'Statutory Auditors',
      version: 'v3.2.0-sovereign',
      active: true,
      iconClass: 'hayagriva-forms-icon',
      synced: true,
      description: 'Audits connected persons against MCA-21, CIBIL defaulters, and bare act statutory provisos'
    },
    {
      id: '@Claims',
      name: 'Creditor Claim Forensic Auditor',
      role: 'Forms B/C/CA verification, interest recalculation & disallowance ledger',
      category: 'Forensic Specialists',
      version: 'v3.2.0-sovereign',
      active: true,
      iconClass: 'hayagriva-claims-icon',
      synced: true,
      description: 'Verifies financial & operational creditor claims, extracts bank ledgers, computes admitted amounts and CoC voting share'
    },
    {
      id: '@BankForensic',
      name: 'Bank Statement Forensic Normalizer',
      role: 'Multi-bank cash flow, contra-sweep elimination & avoidance inquest (§§ 43, 45, 50, 66)',
      category: 'Forensic Specialists',
      version: 'v3.2.0-sovereign',
      active: false,
      iconClass: 'hayagriva-bank-icon',
      synced: true,
      description: 'Normalizes high-volume bank statements (SBI, HDFC, ICICI, Axis, PNB) and flags preferential/fraudulent money trails'
    }
  ];

  constructor(
    @inject(ILogger) protected readonly logger: ILogger
  ) {}

  getAllCoworkers(): CoworkerSpec[] {
    return [...this.coworkers];
  }

  getActiveCoworkers(): CoworkerSpec[] {
    return this.coworkers.filter(c => c.active);
  }

  getActiveCoworkerIds(): string[] {
    return this.coworkers.filter(c => c.active).map(c => c.id);
  }

  isCoworkerActive(id: string): boolean {
    const c = this.coworkers.find(it => it.id === id);
    return c ? c.active : false;
  }

  setCoworkerActive(id: string, active: boolean): void {
    const coworker = this.coworkers.find(c => c.id === id);
    if (coworker && coworker.active !== active) {
      coworker.active = active;
      this.logger.info(`[AgentCockpitManager] Coworker ${id} active status set to ${active}`);
      this.onActiveCoworkersChangedEmitter.fire(this.getActiveCoworkerIds());
    }
  }

  toggleCoworker(id: string): boolean {
    const coworker = this.coworkers.find(c => c.id === id);
    if (coworker) {
      this.setCoworkerActive(id, !coworker.active);
      return coworker.active;
    }
    return false;
  }

  async syncSkills(id: string): Promise<boolean> {
    const coworker = this.coworkers.find(c => c.id === id);
    if (coworker) {
      coworker.synced = true;
      return true;
    }
    return false;
  }
}
