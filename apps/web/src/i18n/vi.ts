import type { MessageKey } from './en';

export const vi: Record<MessageKey, string> = {
  'common.retry': 'Thử lại', // REVIEW
  'common.cancel': 'Hủy', // REVIEW
  'common.save': 'Lưu', // REVIEW
  'common.continue': 'Tiếp tục', // REVIEW
  'common.back': 'Quay lại', // REVIEW
  'common.close': 'Đóng', // REVIEW
  'common.loading': 'Đang tải…', // REVIEW

  'error.generic': 'Có lỗi xảy ra. Thử lại.', // REVIEW
  'error.dailyLimit': 'Đã vượt giới hạn miễn phí hôm nay. Thử lại sau 07:00.', // REVIEW
  'error.linkDead': 'Liên kết này không còn hoạt động. Hãy xin trưởng nhóm liên kết mới.', // REVIEW
  'error.rateLimited': 'Quá nhiều mục đang chờ duyệt. Hãy nhờ một thành viên duyệt trước.', // REVIEW

  'lang.vi': 'Tiếng Việt', // REVIEW
  'lang.en': 'English', // REVIEW

  'time.justNow': 'vừa xong', // REVIEW
  'time.minutesAgo': '{n} phút trước', // REVIEW
  'time.hoursAgo': '{n} giờ trước', // REVIEW
  'time.daysAgo': '{n} ngày trước', // REVIEW

  'fewest.title': 'Ít lần chuyển khoản nhất', // REVIEW
  'fewest.explain': 'Khoản nợ của mọi người được gom lại để số lần chuyển khoản là ít nhất. Tổng số tiền mỗi người phải trả không đổi.', // REVIEW

  'who.lastUsedHere': 'Lần trước bạn đã chọn người này trên điện thoại này', // REVIEW
  'who.activeElsewhere': 'Đang hoạt động trên máy khác · {ago}', // REVIEW
  'who.someoneNew': 'Tôi là người mới', // REVIEW
  'who.areYou': 'Bạn là {name} phải không?', // REVIEW
  'who.yesIm': 'Đúng, tôi là {name}', // REVIEW
  'who.noAddMe': 'Không, thêm tôi vào', // REVIEW

  'expenses.empty': 'Chưa có khoản chi nào. Hãy thêm khoản đầu tiên.', // REVIEW
  'expenses.disabledBy': 'Đã bị vô hiệu hóa bởi {name}', // REVIEW
  'expense.sendForApproval': 'Gửi để duyệt', // REVIEW

  'approvals.saysPaid': '{name} báo đã chuyển khoản. Bạn đã nhận được tiền chưa?', // REVIEW

  'pay.payWithVietQr': 'Thanh toán bằng VietQR', // REVIEW
  'pay.keepNote': 'Giữ nguyên nội dung chuyển khoản này để đối soát thanh toán.', // REVIEW
  'pay.bankPending': 'Thông tin ngân hàng của {name} đang chờ duyệt', // REVIEW
  'pay.bankNone': '{name} chưa thêm thông tin ngân hàng', // REVIEW
  'pay.waiting': 'Đang chờ {name} nhận được tiền. Trang này sẽ tự động cập nhật.', // REVIEW
  'pay.alreadyPaid': 'Tôi đã chuyển tiền rồi', // REVIEW
  'pay.openBankApp': 'Mở ứng dụng ngân hàng', // REVIEW
  'pay.saveQr': 'Lưu mã QR', // REVIEW

  'landing.tagline': 'Chia tiền chuyến đi cùng bạn bè và thanh toán bằng VietQR. Bạn bè tham gia bằng liên kết — không cần tài khoản.', // REVIEW
  'landing.signIn': 'Đăng nhập bằng Google', // REVIEW

  'trips.title': 'Chuyến đi của tôi', // REVIEW
  'trips.new': 'Chuyến đi mới', // REVIEW
  'trips.empty': 'Chưa có chuyến đi nào. Hãy tạo chuyến đi đầu tiên.', // REVIEW
  'trips.youreOwed': 'Bạn được nhận', // REVIEW
  'trips.youOwe': 'Bạn cần trả', // REVIEW
  'trips.settled': 'Đã thanh toán hết', // REVIEW
  'trips.archived': 'Đã lưu trữ', // REVIEW

  'create.title': 'Chuyến đi mới', // REVIEW
  'create.tripName': 'Tên chuyến đi', // REVIEW
  'create.tripNamePlaceholder': 'Đà Lạt · Th10 2026', // REVIEW
  'create.myName': 'Tên của bạn', // REVIEW
  'create.others': 'Ai sẽ tham gia cùng?', // REVIEW
  'create.otherPlaceholder': 'Tên', // REVIEW
  'create.addPerson': 'Thêm người', // REVIEW
  'create.removePerson': 'Xóa {name}', // REVIEW
  'create.bankTitle': 'Thông tin ngân hàng của bạn (không bắt buộc)', // REVIEW
  'create.bankHint': 'Để bạn bè có thể chuyển khoản trả bạn qua VietQR. Bạn có thể thêm sau.', // REVIEW
  'create.submit': 'Tạo chuyến đi', // REVIEW

  'bank.bank': 'Ngân hàng', // REVIEW
  'bank.popular': 'Phổ biến', // REVIEW
  'bank.allBanks': 'Tất cả ngân hàng', // REVIEW
  'bank.choose': 'Chọn ngân hàng', // REVIEW
  'bank.accountNumber': 'Số tài khoản', // REVIEW
  'bank.holderName': 'Tên chủ tài khoản', // REVIEW
  'bank.holderHint': 'Như hiển thị trên ngân hàng, không dấu.', // REVIEW

  'consent.title': 'Trước khi bắt đầu', // REVIEW
  'consent.body': 'Chúng tôi lưu tên, email, các chuyến đi bạn tham gia và thông tin ngân hàng bạn thêm, để nhóm của bạn có thể chia tiền và thanh toán cho nhau.', // REVIEW
  'consent.agree': 'Tôi đồng ý với thông báo quyền riêng tư', // REVIEW
  'consent.readNotice': 'Đọc thông báo quyền riêng tư', // REVIEW

  'privacy.title': 'Thông báo quyền riêng tư', // REVIEW
  'privacy.draft': 'Bản nháp — đang chờ duyệt pháp lý', // REVIEW

  'join.opening': 'Đang mở chuyến đi…', // REVIEW

  'who.title': 'Bạn là ai?', // REVIEW
  'who.subtitle': 'Chọn tên của bạn để tiếp tục.', // REVIEW
  'who.continueAs': 'Tiếp tục với tên {name}', // REVIEW
  'who.memberHint': 'Đã đăng nhập — chạm để đăng nhập với tên {name}', // REVIEW
  'who.pending': 'Đang chờ duyệt', // REVIEW
  'who.notOnList': 'Không có tên trong danh sách?', // REVIEW
  'who.newTitle': 'Tên của bạn là gì?', // REVIEW
  'who.newHint': 'Dùng tên mà bạn bè hay gọi bạn.', // REVIEW
  'who.nameLabel': 'Tên của bạn', // REVIEW
  'who.inTrip': 'Đã có trong chuyến đi này', // REVIEW
  'who.similar': '"{typed}" có vẻ giống "{name}", người đã có trong chuyến đi này.', // REVIEW
  'who.newPendingNote': 'Một thành viên sẽ kiểm tra tên mới trước khi xuất hiện trong chuyến đi.', // REVIEW

  'guest.viewingAs': 'Đang xem với tư cách {name}', // REVIEW
  'guest.switch': 'Không phải {name}? Đổi tên', // REVIEW
  'guest.youOwe': 'Bạn cần trả {name}', // REVIEW
  'guest.youreOwed': 'Bạn được nhận', // REVIEW
  'guest.settled': 'Bạn đã thanh toán hết', // REVIEW
  'guest.dropsTo': 'Giảm xuống {amount} nếu các khoản chi của bạn được duyệt', // REVIEW
  'guest.yourShare': 'Cách tính phần của bạn', // REVIEW
  'guest.yourTotal': 'Tổng của bạn', // REVIEW
  'guest.becomeMember': 'Đăng nhập bằng Google để trở thành thành viên', // REVIEW
  'guest.memberRequested': 'Bạn đã yêu cầu trở thành thành viên. Một thành viên sẽ duyệt yêu cầu này.', // REVIEW

  'trip.total': 'Tổng chuyến đi {amount}', // REVIEW
  'trip.people': '{n} người', // REVIEW
  'trip.balances': 'Số dư', // REVIEW
  'trip.whoPaysWhom': 'Ai trả ai', // REVIEW
  'trip.expenses': 'Khoản chi', // REVIEW
  'trip.addExpense': '+ Thêm khoản chi', // REVIEW
  'trip.pays': '{from} → {to}', // REVIEW
  'trip.viewOnly': 'Chỉ xem', // REVIEW
  'trip.you': 'Bạn', // REVIEW
  'trip.allSettled': 'Mọi người đã thanh toán hết.', // REVIEW
  'trip.waitingConfirm': '{amount} đang chờ {name} xác nhận', // REVIEW

  'expense.youPaid': 'Bạn đã trả', // REVIEW
  'expense.personPaid': '{name} đã trả', // REVIEW
  'split.equal': 'chia đều, {n}', // REVIEW
  'split.amounts': 'số tiền chính xác', // REVIEW
  'split.percent': 'theo phần trăm', // REVIEW
  'split.shares': 'theo phần chia', // REVIEW
  'split.adjust': 'có điều chỉnh', // REVIEW
  'status.waiting': 'Đang chờ', // REVIEW
  'status.rejected': 'Bị từ chối', // REVIEW
  'status.disabled': 'Đã vô hiệu hóa', // REVIEW
  'expense.rejectedBecause': 'Bị từ chối: {reason}', // REVIEW
};
