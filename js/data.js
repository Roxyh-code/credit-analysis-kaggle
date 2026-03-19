/* ================================================
   DATA GENERATOR — Synthetic Loan Default Dataset
   Matches distributions of Kaggle nikhil1e9/loan-default
   ================================================ */

function generateData(n = 2500) {
  // Seeded LCG for reproducibility
  let seed = 42;
  function lcg() {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  }
  function randn() {
    // Box-Muller
    const u1 = lcg() || 1e-10;
    const u2 = lcg();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  const employmentTypes = ['Full-time', 'Part-time', 'Self-employed', 'Unemployed'];
  const educationLevels = ["High School", "Bachelor's", "Master's", "PhD"];
  const loanPurposes    = ['Personal', 'Business', 'Home', 'Education', 'Medical', 'Auto'];

  const data = [];
  for (let i = 0; i < n; i++) {
    const age = Math.max(18, Math.min(70, Math.round(18 + lcg() * 52)));

    // Income: log-normal ~$55k median
    const income = Math.max(15000, Math.min(200000,
      Math.round(Math.exp(10.9 + randn() * 0.55))
    ));

    // Credit score: normal ~650, sd 80
    const creditScore = Math.max(300, Math.min(850,
      Math.round(640 + randn() * 85)
    ));

    // Loan amount: log-normal, correlated with income
    const loanAmount = Math.max(1000, Math.min(50000,
      Math.round(Math.exp(9.4 + randn() * 0.65))
    ));

    // Interest rate: inversely correlated with credit score
    const baseRate = 4 + ((850 - creditScore) / 550) * 18;
    const interestRate = Math.max(3.5, Math.min(25,
      +(baseRate + randn() * 1.2).toFixed(2)
    ));

    // Debt-to-income ratio
    const dtiRatio = Math.max(0.05, Math.min(0.65,
      +((loanAmount / income) * 1.8 + randn() * 0.04).toFixed(3)
    ));

    // Employment type (probability weighted)
    const empRoll = lcg();
    const employmentType = empRoll < 0.62 ? 'Full-time'
      : empRoll < 0.78 ? 'Part-time'
      : empRoll < 0.91 ? 'Self-employed' : 'Unemployed';

    // Education level
    const eduRoll = lcg();
    const education = eduRoll < 0.28 ? "High School"
      : eduRoll < 0.63 ? "Bachelor's"
      : eduRoll < 0.84 ? "Master's" : "PhD";

    // Loan purpose
    const purpose = loanPurposes[Math.floor(lcg() * loanPurposes.length)];

    // Months employed
    const monthsEmployed = employmentType === 'Unemployed'
      ? 0
      : Math.max(0, Math.round(lcg() * 240));

    // Number of credit lines
    const numCreditLines = Math.max(1, Math.round(2 + lcg() * 8));

    // ---- Default probability model (logistic) ----
    let logit = -3.8;
    logit += (650 - creditScore) / 100 * 1.3;    // low credit → higher risk
    logit += (55000 - income) / 18000 * 0.55;     // low income → higher risk
    logit += (loanAmount / income) * 2.8;          // high loan/income → higher risk
    logit += age < 25 ? 0.6 : age < 30 ? 0.3 : 0; // youth risk premium
    logit += employmentType === 'Unemployed' ? 1.4
           : employmentType === 'Part-time'  ? 0.45
           : employmentType === 'Self-employed' ? 0.15 : 0;
    logit += education === 'High School' ? 0.35 : 0;
    logit += dtiRatio > 0.5 ? 0.8 : dtiRatio > 0.35 ? 0.3 : 0;
    logit += randn() * 0.7;  // noise

    const defaultProb = 1 / (1 + Math.exp(-logit));
    const defaulted   = lcg() < defaultProb ? 1 : 0;

    data.push({
      id: i,
      age,
      income,
      loanAmount,
      creditScore,
      interestRate,
      dtiRatio,
      employmentType,
      education,
      purpose,
      monthsEmployed,
      numCreditLines,
      default: defaulted
    });
  }
  return data;
}

// ---- Categorization helpers ----

function ageGroup(age) {
  if (age < 30) return '青年 <30';
  if (age < 45) return '中年 30-45';
  if (age < 60) return '壮年 45-60';
  return '老年 60+';
}

function incomeGroup(income) {
  if (income < 35000)  return '低 <3.5万';
  if (income < 65000)  return '中 3.5-6.5万';
  if (income < 110000) return '高 6.5-11万';
  return '极高 11万+';
}

function creditGroup(score) {
  if (score < 580) return '差 <580';
  if (score < 670) return '一般 580-670';
  if (score < 740) return '良 670-740';
  return '优 740+';
}

function loanGroup(amount) {
  if (amount < 8000)  return '小额 <8k';
  if (amount < 22000) return '中额 8-22k';
  return '大额 22k+';
}

function categorize(d) {
  return Object.assign({}, d, {
    ageGroup:    ageGroup(d.age),
    incomeGroup: incomeGroup(d.income),
    creditGroup: creditGroup(d.creditScore),
    loanGroup:   loanGroup(d.loanAmount),
    outcome:     d.default === 1 ? '违约' : '正常还款'
  });
}

// Field display helpers
const FIELD_LABELS = {
  creditScore:   '信用评分',
  income:        '收入 ($)',
  age:           '年龄',
  loanAmount:    '贷款金额 ($)',
  dtiRatio:      '负债比率',
  interestRate:  '利率 (%)',
  monthsEmployed:'在职月数'
};

const FIELD_FORMAT = {
  income:       v => '$' + (v / 1000).toFixed(0) + 'k',
  loanAmount:   v => '$' + (v / 1000).toFixed(1) + 'k',
  creditScore:  v => v.toFixed(0),
  age:          v => v.toFixed(0) + '岁',
  dtiRatio:     v => (v * 100).toFixed(1) + '%',
  interestRate: v => v.toFixed(2) + '%',
  monthsEmployed: v => v.toFixed(0) + '月'
};
