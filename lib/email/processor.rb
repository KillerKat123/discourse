module Email

  class Processor

    def initialize(mail)
      @mail = mail
    end

    def self.process!(mail)
      Email::Processor.new(mail).process!
    end

    def process!
      begin
        receiver = Email::Receiver.new(@mail)
        receiver.process!
      rescue Email::Receiver::BouncedEmailError => e
        # never reply to bounced emails
        log_email_process_failure(@mail, e)
        set_incoming_email_rejection_message(receiver.incoming_email, I18n.t("emails.incoming.errors.bounced_email_error"))
      rescue => e
        log_email_process_failure(@mail, e)
        incoming_email = receiver.try(:incoming_email)
        rejection_message = handle_failure(@mail, e, incoming_email)
        if rejection_message.present?
          set_incoming_email_rejection_message(incoming_email, rejection_message.body.to_s)
        end
      end
    end

    private

    def handle_failure(mail_string, e, incoming_email)
      message_template = case e
        when Email::Receiver::EmptyEmailError             then :email_reject_empty
        when Email::Receiver::NoBodyDetectedError         then :email_reject_empty
        when Email::Receiver::UserNotFoundError           then :email_reject_user_not_found
        when Email::Receiver::ScreenedEmailError          then :email_reject_screened_email
        when Email::Receiver::AutoGeneratedEmailError     then :email_reject_auto_generated
        when Email::Receiver::InactiveUserError           then :email_reject_inactive_user
        when Email::Receiver::BlockedUserError            then :email_reject_blocked_user
        when Email::Receiver::BadDestinationAddress       then :email_reject_bad_destination_address
        when Email::Receiver::StrangersNotAllowedError    then :email_reject_strangers_not_allowed
        when Email::Receiver::InsufficientTrustLevelError then :email_reject_insufficient_trust_level
        when Email::Receiver::ReplyUserNotMatchingError   then :email_reject_reply_user_not_matching
        when Email::Receiver::TopicNotFoundError          then :email_reject_topic_not_found
        when Email::Receiver::TopicClosedError            then :email_reject_topic_closed
        when Email::Receiver::InvalidPost                 then :email_reject_invalid_post
        when ActiveRecord::Rollback                       then :email_reject_invalid_post
        when Email::Receiver::InvalidPostAction           then :email_reject_invalid_post_action
        when Discourse::InvalidAccess                     then :email_reject_invalid_access
        when RateLimiter::LimitExceeded                   then :email_reject_rate_limit_specified
      end

      template_args = {}
      client_message = nil

      # there might be more information available in the exception
      if message_template == :email_reject_invalid_post && e.message.size > 6
        message_template = :email_reject_invalid_post_specified
        template_args[:post_error] = e.message
      end

      if message_template == :email_reject_rate_limit_specified
        template_args[:rate_limit_description] = e.description
      end

      if message_template
        # inform the user about the rejection
        message = Mail::Message.new(mail_string)
        template_args[:former_title] = message.subject
        template_args[:destination] = message.to
        template_args[:site_name] = SiteSetting.title

        client_message = RejectionMailer.send_rejection(message_template, message.from, template_args)

        # don't send more than 1 reply per day to auto-generated emails
        if !incoming_email.try(:is_auto_generated) || can_reply_to_auto_generated?(message.from)
          Email::Sender.new(client_message, message_template).send
        end
      else
        Rails.logger.error("Unrecognized error type (#{e}) when processing incoming email\n\nMail:\n#{mail_string}")
      end

      client_message
    end

    def can_reply_to_auto_generated?(email)
      key = "auto_generated_reply:#{email}:#{Date.today}"

      if $redis.setnx(key, "1")
        $redis.expire(key, 25.hours)
        true
      else
        false
      end
    end

    def set_incoming_email_rejection_message(incoming_email, message)
      incoming_email.update_attributes!(rejection_message: message)
    end

    def log_email_process_failure(mail_string, exception)
      if SiteSetting.log_mail_processing_failures
        Rails.logger.warn("Email can not be processed: #{exception}\n\n#{mail_string}")
      end
    end

  end

end
