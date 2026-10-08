/* =========================================================
   0. Supabase 설정 (여기에 내 프로젝트 정보를 직접 넣으세요)
   ---------------------------------------------------------
   Supabase 대시보드 → Project Settings → API 에서 확인할 수 있습니다.
   - SUPABASE_URL : Project URL       예) 'https://abcdefgh.supabase.co'
   - SUPABASE_KEY : anon(public) 키 또는 publishable 키
     ※ service_role(secret) 키는 절대 넣으면 안 됩니다!
       이 파일은 누구나 브라우저에서 볼 수 있기 때문입니다.
   ========================================================= */
const SUPABASE_URL = 'https://ysbloaazudixbmthfhjo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzYmxvYWF6dWRpeGJtdGhmaGpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MDQxNTEsImV4cCI6MjEwNjk4MDE1MX0.wmJLKj5wWk_KY6oY-K1HF-pZFfTEyUBd6JFoD-lh4JQ';

/* Supabase에 접속하는 "클라이언트"를 만듭니다.
   index.html에서 불러온 supabase-js 라이브러리가 window.supabase 로 들어와 있고,
   그 안의 createClient(주소, 키) 함수로 클라이언트를 만듭니다.

   URL이나 KEY를 아직 안 넣었으면 createClient가 오류를 내서
   나머지 기능(금액 계산, 탭 등)까지 멈춰버립니다.
   그래서 값이 둘 다 있을 때만 만들고, 없으면 null(비어있음)로 둡니다. */
let supabaseClient = null;
if (SUPABASE_URL !== '' && SUPABASE_KEY !== '') {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.warn('SUPABASE_URL과 SUPABASE_KEY를 script.js 맨 위에 넣어주세요.');
}


/* =========================================================
   바이브 카페 주문서 - 기능 스크립트
   ---------------------------------------------------------
   이 파일이 하는 일
   1) 음료/사이즈/옵션/수량이 바뀔 때마다 예상 금액을 다시 계산해서 보여줍니다.
   2) 주문하기 버튼을 누르면 입력값을 검사하고, 주문 확인 메시지를 띄웁니다.
   3) 다시 작성 버튼을 누르면 주문서만 처음 상태로 되돌립니다.
   4) 접수된 주문을 Supabase의 cafe_menu03 테이블에 저장합니다.
   5) 저장된 주문을 orders 배열에도 담아 "주문 내역" 탭에 보여줍니다.
   6) "주문하기" / "주문 내역" 탭을 눌러 화면을 바꿉니다.

   index.html에서 script 태그에 defer를 붙였기 때문에,
   HTML을 전부 읽은 뒤에 이 코드가 실행됩니다.
   그래서 아래에서 바로 요소를 찾아도 안전합니다.

   ※ 보이기/숨기기는 style.css의 hidden 클래스를 붙였다 뗐다 해서 처리합니다.
     element.classList.add('hidden')    → 숨기기
     element.classList.remove('hidden') → 보이기
   ========================================================= */


/* ---------------------------------------------------------
   1. 화면 요소 찾아두기
   ---------------------------------------------------------
   document.getElementById('아이디')는 HTML에서 그 id를 가진 요소를 찾아줍니다.
   자주 쓰는 요소는 미리 변수(const)에 담아두면 코드가 짧고 읽기 쉬워집니다.
   --------------------------------------------------------- */

// [주문서 관련]
const orderForm = document.getElementById('order-form');       // 주문서 전체(form)
const nameInput = document.getElementById('customer-name');    // 이름 입력칸
const phoneInput = document.getElementById('customer-phone');  // 전화번호 입력칸
const drinkSelect = document.getElementById('drink');          // 음료 드롭다운
const quantityInput = document.getElementById('quantity');     // 수량 입력칸
const requestInput = document.getElementById('request');       // 요청사항 입력칸
const totalPriceSpan = document.getElementById('total-price'); // 예상 금액 숫자가 들어갈 자리
const orderResult = document.getElementById('order-result');   // 주문 확인 메시지 영역
const orderButton = document.getElementById('order-button');   // 주문하기 버튼

// [탭 관련]
const tabOrder = document.getElementById('tab-order');         // "☕ 주문하기" 탭 버튼
const tabHistory = document.getElementById('tab-history');     // "📋 주문 내역" 탭 버튼
const panelOrder = document.getElementById('panel-order');     // 주문하기 화면
const panelHistory = document.getElementById('panel-history'); // 주문 내역 화면
const orderCountBadge = document.getElementById('order-count-badge'); // 탭 옆 주문 건수 배지

// [주문 내역 관련]
const orderList = document.getElementById('order-list');               // 주문 카드가 들어갈 목록(ul)
const emptyMessage = document.getElementById('empty-message');         // "아직 주문 내역이 없어요" 문구
const historySummary = document.getElementById('history-summary');     // 총 금액 + 모두 지우기 영역
const historyTotalPrice = document.getElementById('history-total-price'); // 총 주문 금액 숫자
const historyTotalCount = document.getElementById('history-total-count'); // 총 주문 건수 숫자
const clearOrdersButton = document.getElementById('clear-orders-button'); // 내역 모두 지우기 버튼


/* ---------------------------------------------------------
   2. 주문 내역을 담아둘 변수
   ---------------------------------------------------------
   orders     : 접수된 주문들을 담는 배열. 주문 1건은 객체 { ... } 하나입니다.
                최신 주문이 배열의 맨 앞(0번)에 오도록 저장합니다.
   nextOrderId: 다음 주문에 붙일 주문번호. 주문을 취소해도 번호는 다시 쓰지 않습니다.

   ※ 이 값들은 페이지 메모리에만 있어서, 새로고침하면 사라집니다.
   --------------------------------------------------------- */
let orders = [];
let nextOrderId = 1;


/* ---------------------------------------------------------
   3. 작은 도우미 함수들
   --------------------------------------------------------- */

/**
 * 숫자를 "5,000"처럼 천 단위 콤마가 붙은 글자로 바꿔줍니다.
 * toLocaleString('ko-KR')은 한국식 숫자 표기법으로 바꿔주는 기능입니다.
 * 예) formatPrice(5000) → "5,000"
 */
function formatPrice(number) {
  return number.toLocaleString('ko-KR');
}

/**
 * 수량 입력칸의 값을 읽어서 1~10 사이의 정수로 돌려줍니다.
 * 입력칸에 글자를 지우거나 이상한 값을 넣어도 계산이 깨지지 않게 하기 위함입니다.
 */
function getQuantity() {
  // 입력칸의 값은 항상 "글자"이므로 parseInt로 숫자로 바꿉니다.
  let quantity = parseInt(quantityInput.value, 10);

  // 숫자가 아니면(NaN) 1개로 봅니다.
  if (isNaN(quantity)) {
    quantity = 1;
  }

  // 1보다 작으면 1, 10보다 크면 10으로 맞춥니다.
  if (quantity < 1) quantity = 1;
  if (quantity > 10) quantity = 10;

  return quantity;
}

/**
 * 지금 선택된 음료의 기본 가격(숫자)을 돌려줍니다. 음료를 안 골랐으면 0입니다.
 * selectedIndex = 지금 선택된 항목이 몇 번째인지
 * options[번호] = 그 번째 option 요소
 * dataset.price = 그 option의 data-price 값 (글자라서 Number()로 숫자로 바꿈)
 */
function getDrinkPrice() {
  const selectedDrink = drinkSelect.options[drinkSelect.selectedIndex];
  return Number(selectedDrink.dataset.price);
}

/**
 * 지금 선택된 사이즈 라디오 버튼을 돌려줍니다.
 * querySelector는 CSS 선택자로 요소 하나를 찾아줍니다.
 * 'input[name="size"]:checked' = name이 size인 input 중에서 "체크된 것"
 */
function getSelectedSize() {
  return document.querySelector('input[name="size"]:checked');
}

/**
 * 체크된 추가 옵션 체크박스들을 배열로 돌려줍니다.
 * querySelectorAll은 조건에 맞는 요소를 "전부" 찾아줍니다.
 * Array.from으로 감싸면 배열 기능(map, forEach 등)을 쓸 수 있습니다.
 */
function getCheckedOptions() {
  return Array.from(document.querySelectorAll('input[name="options"]:checked'));
}

/**
 * 주문 1건을 "카페라떼 M사이즈 (샷 추가) 1잔" 같은 한 줄 글자로 만들어줍니다.
 * 주문 확인 메시지와 주문 내역 카드 두 곳에서 똑같이 쓰려고 함수로 뺐습니다.
 * 옵션이 없으면 괄호 부분은 빠집니다. 예) "아메리카노 S사이즈 2잔"
 */
function describeOrder(order) {
  let optionText = '';
  if (order.options.length > 0) {
    // join(', ')은 배열 항목들을 ", "로 이어 붙여줍니다. 예) "샷 추가, 시럽 추가"
    optionText = ' (' + order.options.join(', ') + ')';
  }
  return `${order.drink} ${order.size}사이즈${optionText} ${order.quantity}잔`;
}

/**
 * 지금 시각을 "오후 2:05" 같은 글자로 돌려줍니다.
 */
function getCurrentTime() {
  return new Date().toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  });
}


/* ---------------------------------------------------------
   4. 금액 계산 함수 (이 함수 하나를 여러 곳에서 재사용합니다)
   ---------------------------------------------------------
   계산 공식:
   (음료 가격 + 사이즈 추가 금액 + 옵션 추가 금액들) × 수량

   가격은 HTML의 data-price 속성에서 읽어옵니다.
   예) <option data-price="4000"> 이면 element.dataset.price 는 "4000"(글자)
   글자이기 때문에 Number()로 숫자로 바꿔서 더해야 합니다.
   (그냥 더하면 "4000" + "500" = "4000500" 처럼 글자가 이어붙여져 버립니다!)
   --------------------------------------------------------- */
function calculateTotal() {
  // (1) 음료를 아직 안 골랐으면 계산할 것도 없으니 0원입니다.
  //     첫 번째 항목 "-- 음료를 선택하세요 --"의 value는 빈 글자("")입니다.
  if (drinkSelect.value === '') {
    return 0;
  }

  // (2) 선택된 음료의 기본 가격 (위의 getDrinkPrice 도우미 사용)
  const drinkPrice = getDrinkPrice();

  // (3) 사이즈 추가 금액 (혹시 아무것도 선택 안 됐으면 0원)
  const selectedSize = getSelectedSize();
  const sizePrice = selectedSize ? Number(selectedSize.dataset.price) : 0;

  // (4) 체크된 옵션들의 추가 금액을 모두 더하기
  let optionsPrice = 0;
  getCheckedOptions().forEach(function (option) {
    optionsPrice += Number(option.dataset.price);
  });

  // (5) 한 잔 가격 × 수량 = 최종 금액
  const pricePerCup = drinkPrice + sizePrice + optionsPrice;
  return pricePerCup * getQuantity();
}


/* ---------------------------------------------------------
   5. 예상 금액을 화면에 표시하는 함수
   ---------------------------------------------------------
   calculateTotal()로 계산한 값을 콤마를 붙여 화면에 넣습니다.
   HTML에는 "예상 금액: <span id="total-price">0</span>원" 이 있으므로
   span 안의 숫자만 바꿔주면 "예상 금액: 5,000원"이 됩니다.
   --------------------------------------------------------- */
function updateTotalDisplay() {
  const total = calculateTotal();
  totalPriceSpan.textContent = formatPrice(total);
}


/* ---------------------------------------------------------
   6. 실시간 금액 계산 연결
   ---------------------------------------------------------
   form 안의 어떤 입력이든 바뀌면 이벤트가 form까지 올라옵니다(이벤트 버블링).
   그래서 입력칸마다 따로 연결하지 않고, form 한 곳에만 연결해도 됩니다.
   - 'input'  : 글자를 칠 때마다, 수량 화살표를 누를 때마다 발생
   - 'change' : 드롭다운/라디오/체크박스 선택이 바뀌었을 때 발생
   --------------------------------------------------------- */
orderForm.addEventListener('input', updateTotalDisplay);
orderForm.addEventListener('change', updateTotalDisplay);

// 수량 칸에서 손을 뗐을 때(change), 범위를 벗어난 값이면 1~10 사이 값으로 고쳐서 보여줍니다.
quantityInput.addEventListener('change', function () {
  quantityInput.value = getQuantity();
  updateTotalDisplay();
});


/* ---------------------------------------------------------
   7. 주문하기 버튼 (form 제출 → Supabase에 저장)
   ---------------------------------------------------------
   주문하기 버튼은 type="submit"이라서, 누르면 form의 'submit' 이벤트가 발생합니다.
   기본 동작은 페이지를 새로고침하는 것이므로 event.preventDefault()로 막아줍니다.
   (HTML의 form에 novalidate를 넣었기 때문에, 검사는 브라우저가 아니라 여기서 직접 합니다.)

   ※ async / await 란?
     인터넷으로 데이터를 보내면 답이 올 때까지 시간이 걸립니다.
     함수 앞에 async를 붙이면, 그 안에서 await를 써서
     "답이 올 때까지 기다렸다가 다음 줄로 가기"를 할 수 있습니다.
   --------------------------------------------------------- */
orderForm.addEventListener('submit', async function (event) {
  event.preventDefault(); // 새로고침 막기

  // trim()은 앞뒤 공백을 지워줍니다. 스페이스만 입력한 경우도 "비어있음"으로 봅니다.
  const customerName = nameInput.value.trim();

  // (1) 이름 검사
  if (customerName === '') {
    alert('이름을 입력해주세요');
    nameInput.focus(); // 이름 칸으로 커서를 옮겨줍니다.
    return;            // 여기서 함수를 끝내서 아래 코드가 실행되지 않게 합니다.
  }

  // (2) 음료 선택 검사
  if (drinkSelect.value === '') {
    alert('음료를 선택해주세요');
    drinkSelect.focus();
    return;
  }

  // (3) Supabase 설정이 안 되어 있으면 저장할 수 없으니 알려줍니다.
  if (supabaseClient === null) {
    alert('주문 저장에 실패했어요');
    console.error('Supabase 설정이 비어 있습니다. script.js 맨 위의 SUPABASE_URL과 SUPABASE_KEY를 넣어주세요.');
    return;
  }

  // (4) 검사를 통과했으면 주문 1건을 객체로 만듭니다.
  //     객체는 { 이름표: 값 } 묶음이라서, 여러 정보를 한 덩어리로 들고 다니기 좋습니다.
  const order = {
    id: nextOrderId,                          // 주문번호 예) 1 (화면 표시용)
    name: customerName,                       // 이름 예) "홍길동"
    phone: phoneInput.value.trim(),           // 전화번호 (없으면 빈 글자 "")
    drink: drinkSelect.value,                 // 음료 예) "카페라떼"
    drinkPrice: getDrinkPrice(),              // 음료 기본 가격 예) 4000
    size: getSelectedSize().value,            // 사이즈 예) "M"
    // 체크된 옵션들의 이름만 뽑아서 배열로 만듭니다. 예) ["샷 추가", "시럽 추가"]
    options: getCheckedOptions().map(function (option) {
      return option.value;
    }),
    quantity: getQuantity(),                  // 수량 예) 1
    request: requestInput.value.trim(),       // 요청사항 (없으면 빈 글자 "")
    total: calculateTotal(),                  // 금액 예) 5000 (같은 계산 함수 재사용!)
    time: getCurrentTime(),                   // 주문 시간 예) "오후 2:05"
  };

  // (5) 저장하는 동안 주문하기 버튼을 잠가서 두 번 눌리지 않게 합니다.
  //     disabled = true 이면 버튼을 눌러도 아무 일도 일어나지 않습니다.
  orderButton.disabled = true;
  orderButton.textContent = '저장 중...';

  // (6) Supabase의 cafe_menu03 테이블에 한 줄(행)을 추가합니다.
  //     insert({ 열 이름: 값 })  → 왼쪽은 테이블의 열 이름, 오른쪽은 넣을 값입니다.
  //     결과로 { error } 를 받아서, error가 있으면 실패, 없으면 성공입니다.
  //     try / catch 는 인터넷이 끊기는 등 예상 못한 오류가 나도 멈추지 않게 잡아줍니다.
  //     finally 안의 코드는 성공하든 실패하든 "항상" 마지막에 실행됩니다.
  let saved = false;
  try {
    const { error } = await supabaseClient
      .from('cafe_menu03')
      .insert({
        customer_name: order.name,
        phone: order.phone,
        drink: order.drink,
        drink_price: order.drinkPrice,
        size: order.size,
        options: order.options,        // 배열 그대로 저장 예) ["샷 추가"]
        quantity: order.quantity,
        request: order.request,
        total_price: order.total,
      });

    if (error) {
      // Supabase가 "저장 못 했어요"라고 답한 경우 (권한, 열 이름 오타 등)
      console.error('주문 저장 실패:', error);
    } else {
      saved = true;
    }
  } catch (err) {
    // 인터넷 연결 문제 등으로 요청 자체가 실패한 경우
    console.error('주문 저장 중 오류:', err);
  } finally {
    // 버튼을 원래대로 돌려놓습니다.
    orderButton.disabled = false;
    orderButton.textContent = '주문하기';
  }

  // (7) 저장에 실패했으면 알림만 띄우고 끝냅니다. (주문 내역에도 넣지 않습니다.)
  if (!saved) {
    alert('주문 저장에 실패했어요');
    return;
  }

  // (8) 저장 성공! orders 배열의 "맨 앞"에 넣어서 최신 주문이 맨 위에 오게 합니다.
  //     push()는 맨 뒤에, unshift()는 맨 앞에 추가합니다.
  orders.unshift(order);
  nextOrderId = nextOrderId + 1; // 다음 주문은 다음 번호로

  // (9) 주문 내역 화면과 배지를 새로 그립니다.
  renderOrders();

  // (10) 주문 확인 메시지 만들기 (백틱 ` 안에서는 ${변수}로 값을 끼워 넣을 수 있습니다.)
  //      예) "홍길동님, 카페라떼 M사이즈 (샷 추가) 1잔, 총 5,000원 주문이 접수되었습니다!"
  const message =
    `${order.name}님, ${describeOrder(order)}, ` +
    `총 ${formatPrice(order.total)}원 주문이 접수되었습니다!`;

  // (11) 메시지를 화면에 넣고, hidden 클래스를 떼서 보이게 합니다.
  //      textContent를 쓰면 손님이 입력한 글자가 HTML로 해석되지 않아 안전합니다.
  orderResult.textContent = message;
  orderResult.classList.remove('hidden');
});


/* ---------------------------------------------------------
   8. 다시 작성 버튼 (주문서만 초기화)
   ---------------------------------------------------------
   다시 작성 버튼은 type="reset"이라서, 누르면 브라우저가 form 안의 입력값을
   HTML에 처음 적혀 있던 값으로 되돌려 줍니다.
   (M 사이즈는 checked, 수량은 value="1"로 적혀 있으므로 그대로 돌아갑니다.)
   orders 배열은 건드리지 않으므로 주문 내역은 그대로 남습니다.

   단, 'reset' 이벤트는 "값이 실제로 지워지기 직전"에 발생합니다.
   그래서 setTimeout(..., 0)으로 아주 잠깐 미뤄서,
   초기화가 끝난 뒤에 금액과 메시지를 정리합니다.
   --------------------------------------------------------- */
orderForm.addEventListener('reset', function () {
  setTimeout(function () {
    // 확실하게 하기 위해 기본값을 한 번 더 직접 지정합니다.
    document.getElementById('size-m').checked = true; // M 사이즈 선택
    quantityInput.value = 1;                          // 수량 1

    // 예상 금액을 다시 계산합니다. (음료가 선택 안 된 상태라 0원이 됩니다.)
    updateTotalDisplay();

    // 주문 확인 메시지를 지우고 다시 숨깁니다.
    orderResult.textContent = '';
    orderResult.classList.add('hidden');

    // 이름 칸에 커서를 둬서 바로 다시 입력할 수 있게 합니다.
    nameInput.focus();
  }, 0);
});


/* ---------------------------------------------------------
   9. 주문 내역 그리기 (목록 그리는 코드는 이 함수 하나뿐입니다)
   ---------------------------------------------------------
   orders 배열을 보고 화면을 "처음부터 다시" 그립니다.
   주문이 추가되든, 취소되든, 모두 지워지든 이 함수만 부르면 화면이 맞춰집니다.

   ※ 보안: 손님이 입력한 이름/요청사항은 반드시 textContent로 넣습니다.
     innerHTML로 넣으면 손님이 <script> 같은 글자를 입력했을 때
     그것이 진짜 코드로 실행될 수 있어 위험합니다.
   --------------------------------------------------------- */
function renderOrders() {
  // (1) 기존에 그려진 카드를 모두 지웁니다.
  //     목록 안에 자식 요소가 남아있는 동안 첫 번째 자식을 계속 지웁니다.
  while (orderList.firstChild) {
    orderList.removeChild(orderList.firstChild);
  }

  // (2) 주문 카드를 하나씩 만들어서 목록에 붙입니다.
  orders.forEach(function (order) {
    // 카드 틀: <li class="order-card">
    const card = document.createElement('li');
    card.className = 'order-card';

    // 1줄: "#1 홍길동님 · 5,000원"
    const title = document.createElement('p');
    title.className = 'order-title';
    title.textContent = `#${order.id} ${order.name}님 · ${formatPrice(order.total)}원`;

    // 2줄: "카페라떼 M사이즈 (샷 추가) 1잔"
    const detail = document.createElement('p');
    detail.className = 'order-detail';
    detail.textContent = describeOrder(order);

    // 3줄: 요청사항(있을 때만) · 주문 시간
    const meta = document.createElement('p');
    meta.className = 'order-meta';
    if (order.request !== '') {
      meta.textContent = `${order.request} · ${order.time}`;
    } else {
      meta.textContent = order.time;
    }

    // 오른쪽 위 "취소" 버튼
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'cancel-button';
    cancelButton.textContent = '취소';
    // 이 버튼을 누르면 "이 카드의 주문번호"로 취소 함수를 부릅니다.
    cancelButton.addEventListener('click', function () {
      cancelOrder(order.id);
    });

    // 만든 조각들을 카드 안에 차례로 넣고, 카드를 목록에 넣습니다.
    card.appendChild(cancelButton);
    card.appendChild(title);
    card.appendChild(detail);
    card.appendChild(meta);
    orderList.appendChild(card);
  });

  // (3) 총 주문 금액과 건수를 계산합니다.
  let sumPrice = 0;
  orders.forEach(function (order) {
    sumPrice += order.total;
  });
  const count = orders.length; // 배열 길이 = 주문 건수

  historyTotalPrice.textContent = formatPrice(sumPrice);
  historyTotalCount.textContent = count;
  orderCountBadge.textContent = count;

  // (4) 주문이 있는지 없는지에 따라 보일 것/숨길 것을 정합니다.
  if (count === 0) {
    emptyMessage.classList.remove('hidden');   // 안내 문구 보이기
    historySummary.classList.add('hidden');    // 요약 숨기기
    orderCountBadge.classList.add('hidden');   // 배지 숨기기
  } else {
    emptyMessage.classList.add('hidden');      // 안내 문구 숨기기
    historySummary.classList.remove('hidden'); // 요약 보이기
    orderCountBadge.classList.remove('hidden'); // 배지 보이기
  }
}


/* ---------------------------------------------------------
   10. 주문 취소 / 모두 지우기
   ---------------------------------------------------------
   confirm('질문')은 [확인]/[취소] 창을 띄우고,
   확인을 누르면 true, 취소를 누르면 false를 돌려줍니다.
   --------------------------------------------------------- */

/**
 * 주문번호(id)에 해당하는 주문 1건을 삭제합니다.
 */
function cancelOrder(id) {
  if (!confirm(`#${id} 주문을 취소할까요?`)) {
    return; // [취소]를 눌렀으면 아무것도 하지 않습니다.
  }

  // filter는 조건이 true인 항목만 남긴 "새 배열"을 만들어줍니다.
  // → 주문번호가 id와 "다른" 주문만 남기면, 해당 주문만 빠지게 됩니다.
  orders = orders.filter(function (order) {
    return order.id !== id;
  });

  renderOrders(); // 바뀐 배열로 화면 다시 그리기
}

// "내역 모두 지우기" 버튼
clearOrdersButton.addEventListener('click', function () {
  if (!confirm('주문 내역을 모두 지울까요?')) {
    return;
  }
  orders = [];    // 빈 배열로 바꾸면 모든 주문이 사라집니다.
  renderOrders();
});


/* ---------------------------------------------------------
   11. 탭 전환
   ---------------------------------------------------------
   누른 탭에는 active 클래스를 붙이고(갈색 글씨 + 밑줄),
   그 탭의 화면은 보이게, 다른 화면은 hidden 클래스로 숨깁니다.
   --------------------------------------------------------- */
function switchTab(tabName) {
  // tabName이 'order'면 주문하기 탭, 아니면 주문 내역 탭이 선택된 것
  const isOrderTab = tabName === 'order';

  // classList.toggle('클래스', 조건): 조건이 true면 붙이고, false면 뗍니다.
  tabOrder.classList.toggle('active', isOrderTab);
  tabHistory.classList.toggle('active', !isOrderTab);

  // 화면 읽기 프로그램(스크린 리더)에게도 어떤 탭이 선택됐는지 알려줍니다.
  tabOrder.setAttribute('aria-selected', String(isOrderTab));
  tabHistory.setAttribute('aria-selected', String(!isOrderTab));

  // 선택된 화면만 보이기
  panelOrder.classList.toggle('hidden', !isOrderTab);
  panelHistory.classList.toggle('hidden', isOrderTab);
}

tabOrder.addEventListener('click', function () {
  switchTab('order');
});

tabHistory.addEventListener('click', function () {
  switchTab('history');
});


/* ---------------------------------------------------------
   12. 처음 페이지가 열렸을 때 한 번 실행
   ---------------------------------------------------------
   - 새로고침 시 브라우저가 이전 선택값을 기억하는 경우가 있어서,
     시작할 때도 한 번 금액을 계산해서 화면과 값이 맞도록 해줍니다.
   - 주문 내역도 한 번 그려서 "아직 주문 내역이 없어요 ☕"가 보이게 합니다.
   --------------------------------------------------------- */
updateTotalDisplay();
renderOrders();
