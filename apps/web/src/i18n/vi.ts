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
};
