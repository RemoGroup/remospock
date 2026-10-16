-- Exact proposed reporting assignments; activation approval establishes these mappings.
-- Creator's legacy packet number is not used as a master milestone number.
begin;
insert into rta_reporting.writers(id,lane) values ('spock-g1','spock'),('remocommand-g1','remocommand');
insert into rta_reporting.bindings(id,lane,title,packet,milestone_ids) values
('spock-mb01','spock','Integration and test-baseline engineering','MB-01 PRODUCT CONTINUATION',array['MB-01']),
('spock-creator','spock','Creator workbench engineering','CREATOR WORKBENCH',array['MB-12']),
('spock-reporting','spock','Automatic engineering work reporting','RTA PER-TURN REPORTING',array[]::text[]),
('remocommand-professional','remocommand','Professional membership and security engineering','RAP-03 PROFESSIONAL',array['MB-03']);
commit;
