-- Generated from study-content.js. Run after the CRUD migration.
-- Only fills blank IPA for existing starter words; preserves custom pronunciations.
begin;

update public.vocabulary_words as words set ipa = starter.ipa
from (values
  ('reschedule', '/ˌriːˈʃedjuːl/'),
  ('agenda', '/əˈdʒendə/'),
  ('postpone', '/pəˈspəʊn/'),
  ('attendee', '/əˌtenˈdiː/'),
  ('minutes', '/ˈmɪnɪts/'),
  ('follow up', '/ˌfɒləʊ ˈʌp/'),
  ('adjourn', '/əˈdʒɜːn/'),
  ('regarding', '/rɪˈɡɑːdɪŋ/'),
  ('attached', '/əˈtætʃt/'),
  ('deadline', '/ˈdedlaɪn/'),
  ('deliverable', '/dɪˈlɪvərəbl/'),
  ('status update', '/ˈsteɪtəs ˌʌpdeɪt/'),
  ('clarify', '/ˈklærəfaɪ/'),
  ('escalate', '/ˈeskəleɪt/'),
  ('milestone', '/ˈmaɪlstəʊn/'),
  ('scope', '/skəʊp/'),
  ('stakeholder', '/ˈsteɪkhəʊldə(r)/'),
  ('requirement', '/rɪˈkwaɪəmənt/'),
  ('on track', '/ɒn ˈtræk/'),
  ('behind schedule', '/bɪˈhaɪnd ˈʃedjuːl/'),
  ('bottleneck', '/ˈbɒtlnek/'),
  ('recruit', '/rɪˈkruːt/'),
  ('onboarding', '/ˈɒnbɔːdɪŋ/'),
  ('probation', '/prəˈbeɪʃn/'),
  ('promotion', '/prəˈməʊʃn/'),
  ('resign', '/rɪˈzaɪn/'),
  ('performance review', '/pəˈfɔːməns rɪˈvjuː/'),
  ('workload', '/ˈwɜːkləʊd/'),
  ('budget', '/ˈbʌdʒɪt/'),
  ('invoice', '/ˈɪnvɔɪs/'),
  ('expense', '/ɪkˈspens/'),
  ('quotation', '/kwəʊˈteɪʃn/'),
  ('terms and conditions', '/ˌtɜːmz ən kənˈdɪʃnz/'),
  ('negotiate', '/nɪˈɡəʊʃieɪt/'),
  ('revenue', '/ˈrevənjuː/'),
  ('inquiry', '/ɪnˈkwaɪəri/'),
  ('complaint', '/kəmˈpleɪnt/'),
  ('refund', '/ˈriːfʌnd/'),
  ('deployment', '/dɪˈplɔɪmənt/'),
  ('bug fix', '/ˈbʌɡ fɪks/'),
  ('migration', '/maɪˈɡreɪʃn/'),
  ('rollback', '/ˈrəʊlbæk/')
) as starter(word, ipa)
where words.word = starter.word and words.ipa = '';

commit;
